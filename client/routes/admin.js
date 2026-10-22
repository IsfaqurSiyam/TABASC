const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const AuditLog = require('../models/AuditLog');
const PendingSync = require('../models/PendingSync');
const ReconcileRun = require('../models/ReconcileRun');
const { protect } = require('./auth');
const config = require('../config/env');
const {
  RoleRegistryContract,
  ProductContract,
  ReputationContract,
  TrackingContract,
  getAccounts,
  web3
} = require('../blockchain/web3');
const { AppError } = require('../middleware/errors');
const { validateRequest } = require('../middleware/requestValidation');

const router = express.Router();
const assignableRoles = ['farmer', 'distributor', 'retailer', 'inspector'];
const reputationRoles = ['farmer', 'distributor', 'retailer'];
const roleMethods = {
  farmer: 'FARMER_ROLE',
  distributor: 'DISTRIBUTOR_ROLE',
  retailer: 'RETAILER_ROLE',
  inspector: 'INSPECTOR_ROLE'
};

const isTrue = (value) => value === true || value === 'true';

const requireAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Administrator access required', code: 'FORBIDDEN' });
    }
    const accounts = await getAccounts();
    if (!accounts.length ||
        accounts[0].toLowerCase() !== String(req.user.walletAddress).toLowerCase()) {
      return res.status(403).json({ message: 'Admin wallet is not the configured deployer', code: 'FORBIDDEN' });
    }
    const isAdmin = await RoleRegistryContract.methods
      .isAdmin(req.user.walletAddress)
      .call();
    if (!isTrue(isAdmin)) {
      return res.status(403).json({ message: 'Admin role is not present on-chain', code: 'FORBIDDEN' });
    }
    req.adminWallet = accounts[0];
    return next();
  } catch (error) {
    return next(error);
  }
};

router.use(protect, requireAdmin);

const recordAudit = (actor, action, targetUser, details = {}, txHash = null) => AuditLog.create({
  actor,
  action,
  targetUser,
  details,
  txHash
});

const parsePage = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, max)
    : fallback;
};

const roleHash = async (role) => {
  const methodName = roleMethods[role];
  if (!methodName) {
    throw new AppError(400, 'INVALID_ROLE', 'Role is not eligible for approval');
  }
  return RoleRegistryContract.methods[methodName]().call();
};

router.get('/users', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status === 'pending') {
      filter.requestedRole = { $ne: null };
    } else if (req.query.status === 'active') {
      filter.isActive = true;
    } else if (req.query.status === 'inactive') {
      filter.isActive = false;
    } else if (req.query.status && req.query.status !== 'all') {
      throw new AppError(400, 'VALIDATION_ERROR', 'status must be pending, active, inactive, or all');
    }
    if (req.query.role) {
      if (!['farmer', 'distributor', 'retailer', 'inspector', 'consumer', 'admin'].includes(req.query.role)) {
        throw new AppError(400, 'INVALID_ROLE', 'Unknown user role');
      }
      filter.role = req.query.role;
    }

    const page = parsePage(req.query.page, 1, Number.MAX_SAFE_INTEGER);
    const limit = parsePage(req.query.limit, 25, 100);
    const [users, total, pendingApprovalCount] = await Promise.all([
      User.find(filter)
        .select('name email role requestedRole approvalStatus walletAddress legacyWallet phone location isActive createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
      User.countDocuments({ approvalStatus: 'pending' })
    ]);
    return res.json({ users, page, limit, total, pendingApprovalCount });
  } catch (error) {
    return next(error);
  }
});

router.patch('/users/:id/role', validateRequest({
  params: { id: { required: true, type: 'string' } },
  body: {
    action: { required: true, type: 'string', enum: ['approve', 'reject', 'revoke'] },
    role: { type: 'string', enum: assignableRoles }
  }
}), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError(400, 'INVALID_USER_ID', 'User id is invalid');
    }
    const target = await User.findById(req.params.id);
    if (!target) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    const { action } = req.body;
    if (action === 'reject') {
      if (!target.requestedRole) {
        throw new AppError(400, 'NO_ROLE_REQUEST', 'User has no pending role request');
      }
      const rejectedRole = target.requestedRole;
      target.requestedRole = null;
      await target.save();
      await recordAudit(req.user._id, 'role_request_rejected', target._id, { role: rejectedRole });
      return res.json({ message: 'Role request rejected', userId: target._id, role: target.role });
    }

    if (action === 'approve' && target.approvalStatus === 'pending') {
      throw new AppError(409, 'ACCOUNT_APPROVAL_REQUIRED', 'Approve and activate this account before granting a supply-chain role');
    }

    const role = req.body.role || (action === 'approve' ? target.requestedRole : target.role);
    if (!role || !assignableRoles.includes(role)) {
      throw new AppError(400, 'INVALID_ROLE', 'A valid supply-chain role is required');
    }
    if (action === 'approve' && role !== target.requestedRole) {
      throw new AppError(400, 'ROLE_REQUEST_MISMATCH', 'The approved role must match the pending request');
    }
    if (!web3.utils.isAddress(target.walletAddress)) {
      throw new AppError(400, 'INVALID_WALLET', 'User does not have a valid wallet address');
    }

    const roleId = await roleHash(role);
    const alreadyGranted = isTrue(await RoleRegistryContract.methods
      .hasRole(roleId, target.walletAddress)
      .call());
    let txHash = null;
    if (action === 'approve' && !alreadyGranted) {
      const receipt = await RoleRegistryContract.methods
        .grantRole(roleId, target.walletAddress)
        .send({ from: req.adminWallet });
      txHash = receipt.transactionHash;
    } else if (action === 'revoke' && alreadyGranted) {
      const receipt = await RoleRegistryContract.methods
        .revokeRole(roleId, target.walletAddress)
        .send({ from: req.adminWallet });
      txHash = receipt.transactionHash;
    }

    if (action === 'approve') {
      target.role = role;
      target.requestedRole = null;
    } else if (target.role === role) {
      target.role = 'consumer';
      target.requestedRole = null;
    }
    await target.save();
    await recordAudit(
      req.user._id,
      action === 'approve' ? 'role_approved' : 'role_revoked',
      target._id,
      { role },
      txHash
    );
    return res.json({
      message: action === 'approve' ? 'Role approved' : 'Role revoked',
      userId: target._id,
      role: target.role,
      txHash
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/users/:id/active', validateRequest({
  params: { id: { required: true, type: 'string' } },
  body: { isActive: { required: true, type: 'boolean' } }
}), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new AppError(400, 'INVALID_USER_ID', 'User id is invalid');
    }
    const target = await User.findById(req.params.id);
    if (!target) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }
    if (target.role === 'admin' && !req.body.isActive) {
      throw new AppError(400, 'ADMIN_DEACTIVATION_BLOCKED', 'An admin account cannot be deactivated here');
    }
    target.isActive = req.body.isActive;
    if (req.body.isActive) {
      target.approvalStatus = 'approved';
    }
    await target.save();
    await recordAudit(
      req.user._id,
      req.body.isActive ? 'user_activated' : 'user_deactivated',
      target._id,
      { isActive: target.isActive }
    );
    return res.json({
      userId: target._id,
      isActive: target.isActive,
      approvalStatus: target.approvalStatus || 'approved'
    });
  } catch (error) {
    return next(error);
  }
});

const readReputationConfig = async () => {
  const [weights, alpha, thresholds] = await Promise.all([
    ReputationContract.methods.weights().call(),
    ReputationContract.methods.alpha().call(),
    ReputationContract.methods.thresholds().call()
  ]);
  return {
    weights: {
      quality: Number(weights[0]),
      delivery: Number(weights[1]),
      complaint: Number(weights[2]),
      compliance: Number(weights[3]),
      feedback: Number(weights[4])
    },
    alpha: Number(alpha),
    thresholds: {
      poor: Number(thresholds[0]),
      average: Number(thresholds[1]),
      good: Number(thresholds[2]),
      excellent: Number(thresholds[3])
    }
  };
};

router.get('/reputation-config', async (req, res, next) => {
  try {
    return res.json(await readReputationConfig());
  } catch (error) {
    return next(error);
  }
});

router.patch('/reputation-config', async (req, res, next) => {
  try {
    const { weights, alpha, thresholds } = req.body || {};
    if (!weights && alpha === undefined && !thresholds) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Provide weights, alpha, or thresholds');
    }

    let weightValues;
    if (weights !== undefined) {
      if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
        throw new AppError(400, 'INVALID_WEIGHTS', 'Weights must be an object of basis-point values');
      }
      weightValues = ['quality', 'delivery', 'complaint', 'compliance', 'feedback']
        .map((key) => weights[key]);
      if (weightValues.some((value) => !Number.isInteger(value) || value < 0 || value > 10000) ||
          weightValues.reduce((sum, value) => sum + value, 0) !== 10000 ||
          weightValues[0] + weightValues[3] === 0) {
        throw new AppError(400, 'INVALID_WEIGHTS', 'Weights must total 10000 basis points and include quality or compliance');
      }
    }
    if (alpha !== undefined && (!Number.isInteger(alpha) || alpha < 1 || alpha > 10000)) {
      throw new AppError(400, 'INVALID_ALPHA', 'Alpha must be an integer from 1 to 10000');
    }
    let thresholdValues;
    if (thresholds !== undefined) {
      if (!thresholds || typeof thresholds !== 'object' || Array.isArray(thresholds)) {
        throw new AppError(400, 'INVALID_THRESHOLDS', 'Thresholds must be an object');
      }
      thresholdValues = ['poor', 'average', 'good', 'excellent'].map((key) => thresholds[key]);
      if (thresholdValues.some((value) => !Number.isInteger(value) || value < 0 || value > 10000) ||
          !(thresholdValues[0] < thresholdValues[1] &&
            thresholdValues[1] < thresholdValues[2] &&
            thresholdValues[2] < thresholdValues[3])) {
        throw new AppError(400, 'INVALID_THRESHOLDS', 'Trust thresholds must be increasing integers from 0 to 10000');
      }
    }

    const transactionHashes = [];
    if (weightValues) {
      const receipt = await ReputationContract.methods
        .setWeights(...weightValues)
        .send({ from: req.adminWallet });
      transactionHashes.push(receipt.transactionHash);
    }
    if (alpha !== undefined) {
      const receipt = await ReputationContract.methods
        .setAlpha(alpha)
        .send({ from: req.adminWallet });
      transactionHashes.push(receipt.transactionHash);
    }
    if (thresholdValues) {
      const receipt = await ReputationContract.methods
        .setThresholds(...thresholdValues)
        .send({ from: req.adminWallet });
      transactionHashes.push(receipt.transactionHash);
    }

    await recordAudit(
      req.user._id,
      'reputation_config_updated',
      undefined,
      { weights, alpha, thresholds },
      transactionHashes.join(',')
    );
    return res.json({
      message: 'Reputation configuration updated',
      config: await readReputationConfig(),
      txHashes: transactionHashes
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/overview', async (req, res, next) => {
  try {
    const [userCounts, productCounts, products, stakeholders, pendingSyncs, lastReconcileRun] = await Promise.all([
      Promise.all(['farmer', 'distributor', 'retailer', 'inspector', 'consumer', 'admin']
        .map(async (role) => [role, await User.countDocuments({ role })])),
      Product.aggregate([{ $group: { _id: '$currentStatus', count: { $sum: 1 } } }]),
      Product.find({ blockchainId: { $gt: 0 } }).select('blockchainId batchId name'),
      User.find({
        role: { $in: reputationRoles },
        walletAddress: { $type: 'string' }
      }).select('role walletAddress'),
      PendingSync.countDocuments({ status: 'pending' }),
      ReconcileRun.findOne().sort({ completedAt: -1 })
    ]);

    const recalledProducts = (await Promise.all(products.map(async (product) => {
      const exists = await ProductContract.methods.exists(product.blockchainId).call();
      if (!isTrue(exists)) {
        return null;
      }
      return {
        product,
        recalled: await TrackingContract.methods.isRecalled(product.blockchainId).call()
      };
    }))).filter(Boolean);
    const reputationRows = await Promise.all(stakeholders
      .filter((stakeholder) => web3.utils.isAddress(stakeholder.walletAddress))
      .map(async (stakeholder) => {
        const reputation = await ReputationContract.methods
          .getReputation(stakeholder.walletAddress)
          .call();
        const reputationExists = Array.isArray(reputation) ? reputation[2] : reputation.exists;
        const exists = reputationExists === true || reputationExists === 'true';
        const scoreBps = Array.isArray(reputation) ? reputation[0] : reputation.scoreBps;
        return {
          role: stakeholder.role,
          scoreBps: exists ? Number(scoreBps) : null
        };
      }));
    const averageReputationByRole = reputationRoles.map((role) => {
      const scores = reputationRows
        .filter((entry) => entry.role === role && entry.scoreBps !== null)
        .map((entry) => entry.scoreBps);
      return {
        role,
        stakeholders: scores.length,
        averageScoreBps: scores.length
          ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
          : null,
        averageScore: scores.length
          ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) / 10
          : null
      };
    });

    return res.json({
      userCounts: Object.fromEntries(userCounts),
      productCounts: Object.fromEntries(productCounts.map((row) => [row._id || 'Unknown', row.count])),
      recalledProducts: recalledProducts
        .filter((entry) => entry.recalled)
        .map((entry) => entry.product),
      averageReputationByRole,
      pendingSyncs,
      lastReconcileResult: lastReconcileRun
        ? {
          completedAt: lastReconcileRun.completedAt,
          processed: lastReconcileRun.processed,
          failed: lastReconcileRun.failed,
          result: lastReconcileRun.result
        }
        : null
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/audit-logs', async (req, res, next) => {
  try {
    const page = parsePage(req.query.page, 1, Number.MAX_SAFE_INTEGER);
    const limit = parsePage(req.query.limit, 25, 100);
    const [logs, total] = await Promise.all([
      AuditLog.find()
        .populate('actor', 'name email')
        .populate('targetUser', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AuditLog.countDocuments()
    ]);
    return res.json({ logs, page, limit, total });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
