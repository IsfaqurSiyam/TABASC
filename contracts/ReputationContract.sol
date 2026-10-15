// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IReputationRoleRegistry {
    function hasRole(bytes32 role, address account) external view returns (bool);
    function INSPECTOR_ROLE() external view returns (bytes32);
    function isAdmin(address account) external view returns (bool);
}

interface IReputationProduct {
    function exists(uint256 productId) external view returns (bool);
    function farmerOf(uint256 productId) external view returns (address);
    function registeredAtOf(uint256 productId) external view returns (uint256);
    function deliveryWindowOf(uint256 productId) external view returns (uint256);
    function batchIdOf(uint256 productId) external view returns (string memory);
}

interface IReputationTracking {
    enum Status {
        Harvested,
        PickedUp,
        InTransit,
        Delivered,
        OnShelf,
        Sold
    }

    function getCurrentStatus(uint256 productId) external view returns (Status);
    function actorOf(uint256 productId, Status status) external view returns (address);
    function actedAtOf(uint256 productId, Status status) external view returns (uint256);
    function buyerOf(uint256 productId) external view returns (address);
}

/// @title ReputationContract
/// @notice Computes inspectable batch scores and exponentially accumulated
/// stakeholder reputations in basis points.
contract ReputationContract {
    struct Inspection {
        uint16 quality;
        uint16 compliance;
        address inspector;
        uint256 timestamp;
        bool exists;
    }

    struct Feedback {
        uint16 complaint;
        uint16 satisfaction;
        address buyer;
        uint256 timestamp;
        bool exists;
    }

    struct Reputation {
        uint256 scoreBps;
        uint256 batches;
        bool exists;
    }

    struct ScoreHistory {
        uint256 scoreBps;
        uint256 timestamp;
        string batchId;
    }

    IReputationRoleRegistry public immutable registry;
    IReputationProduct public immutable product;
    IReputationTracking public immutable tracking;

    uint256[5] private _weights = [uint256(3000), 2500, 2000, 1500, 1000];
    uint256 private _alpha = 3000;
    uint256[4] private _thresholds = [uint256(2000), 4000, 6000, 8000];

    mapping(uint256 => Inspection) private _inspections;
    mapping(uint256 => Feedback) private _feedback;
    mapping(address => Reputation) private _reputations;
    mapping(address => ScoreHistory[]) private _history;
    mapping(uint256 => mapping(address => bool)) private _finalized;

    error Unauthorized();
    error InvalidAddress();
    error ProductNotFound();
    error InvalidScore();
    error AlreadyInspected();
    error InspectionRequired();
    error ProductNotSold();
    error NotBuyer();
    error AlreadyReviewed();
    error NonParticipant();
    error AlreadyFinalized();
    error InvalidWeights();
    error InvalidAlpha();
    error InvalidThresholds();
    error DeliveryNotAvailable();
    error InvalidDeliveryWindow();

    event InspectionRecorded(
        uint256 indexed productId,
        address indexed inspector,
        uint16 quality,
        uint16 compliance,
        uint256 timestamp
    );
    event FeedbackSubmitted(
        uint256 indexed productId,
        address indexed buyer,
        uint16 complaint,
        uint16 satisfaction,
        uint256 timestamp
    );
    event ReputationFinalized(
        uint256 indexed productId,
        address indexed stakeholder,
        uint256 batchScore,
        uint256 scoreBps,
        uint256 batches,
        uint256 timestamp
    );
    event WeightsUpdated(uint256[5] weights);
    event AlphaUpdated(uint256 alpha);
    event ThresholdsUpdated(uint256[4] thresholds);

    /// @notice Connects reputation scoring to the registry, product and journey.
    constructor(address registryAddress, address productAddress, address trackingAddress) {
        if (
            registryAddress == address(0) ||
            productAddress == address(0) ||
            trackingAddress == address(0)
        ) revert InvalidAddress();
        registry = IReputationRoleRegistry(registryAddress);
        product = IReputationProduct(productAddress);
        tracking = IReputationTracking(trackingAddress);
    }

    /// @notice Records an inspector's quality and compliance ratings once.
    function recordInspection(uint256 productId, uint16 quality, uint16 compliance) external {
        _requireProduct(productId);
        _requireInspector();
        if (quality > 10000 || compliance > 10000) revert InvalidScore();
        if (_inspections[productId].exists) revert AlreadyInspected();

        _inspections[productId] = Inspection({
            quality: quality,
            compliance: compliance,
            inspector: msg.sender,
            timestamp: block.timestamp,
            exists: true
        });
        emit InspectionRecorded(productId, msg.sender, quality, compliance, block.timestamp);
    }

    /// @notice Records feedback from the buyer already recorded for a sold product.
    function submitFeedback(uint256 productId, uint16 complaint, uint16 satisfaction) external {
        _requireProduct(productId);
        if (tracking.getCurrentStatus(productId) != IReputationTracking.Status.Sold) {
            revert ProductNotSold();
        }
        if (tracking.buyerOf(productId) != msg.sender) revert NotBuyer();
        if (complaint > 10000 || satisfaction > 10000) revert InvalidScore();
        if (_feedback[productId].exists) revert AlreadyReviewed();

        _feedback[productId] = Feedback({
            complaint: complaint,
            satisfaction: satisfaction,
            buyer: msg.sender,
            timestamp: block.timestamp,
            exists: true
        });
        emit FeedbackSubmitted(productId, msg.sender, complaint, satisfaction, block.timestamp);
    }

    /// @notice Finalizes one inspected batch for one of its supply-chain participants.
    function finalizeScore(uint256 productId, address stakeholder) external returns (uint256 scoreBps) {
        _requireProduct(productId);
        _requireInspector();
        if (!_inspections[productId].exists) revert InspectionRequired();
        if (!isParticipant(productId, stakeholder)) revert NonParticipant();
        if (_finalized[productId][stakeholder]) revert AlreadyFinalized();

        Inspection storage inspection = _inspections[productId];
        Feedback storage feedback = _feedback[productId];
        bool hasDelivery =
            uint8(tracking.getCurrentStatus(productId)) >= uint8(IReputationTracking.Status.Delivered);
        uint256[5] memory values;
        bool[5] memory available = [true, hasDelivery, feedback.exists, true, feedback.exists];
        values[0] = inspection.quality;
        values[1] = hasDelivery ? deliveryScoreOf(productId) : 0;
        values[2] = feedback.exists ? feedback.complaint : 0;
        values[3] = inspection.compliance;
        values[4] = feedback.exists ? feedback.satisfaction : 0;
        uint256 batchScore = combine(values, _weights, available);

        Reputation storage current = _reputations[stakeholder];
        if (current.exists) {
            scoreBps = (current.scoreBps * (10000 - _alpha) + batchScore * _alpha) / 10000;
        } else {
            scoreBps = batchScore;
            current.exists = true;
        }

        current.scoreBps = scoreBps;
        current.batches += 1;
        _finalized[productId][stakeholder] = true;
        string memory batchId = product.batchIdOf(productId);
        _history[stakeholder].push(
            ScoreHistory({scoreBps: scoreBps, timestamp: block.timestamp, batchId: batchId})
        );
        emit ReputationFinalized(
            productId,
            stakeholder,
            batchScore,
            scoreBps,
            current.batches,
            block.timestamp
        );
    }

    /// @notice Returns the accumulated basis-point score, batch count and existence flag.
    function getReputation(address stakeholder)
        external
        view
        returns (uint256 scoreBps, uint256 batches, bool exists)
    {
        Reputation storage reputation = _reputations[stakeholder];
        return (reputation.scoreBps, reputation.batches, reputation.exists);
    }

    /// @notice Returns the configured trust level for a stakeholder.
    function getTrustLevel(address stakeholder) external view returns (string memory) {
        Reputation storage reputation = _reputations[stakeholder];
        if (!reputation.exists) return "Unrated";
        return trustLevelForScore(reputation.scoreBps);
    }

    /// @notice Returns the score history, with one entry per finalized batch.
    function getHistory(address stakeholder) external view returns (ScoreHistory[] memory) {
        return _history[stakeholder];
    }

    /// @notice Returns the inspection record for a batch.
    function getInspection(uint256 productId)
        external
        view
        returns (uint16 quality, uint16 compliance, address inspector, uint256 timestamp, bool exists)
    {
        _requireProduct(productId);
        Inspection storage inspection = _inspections[productId];
        return (
            inspection.quality,
            inspection.compliance,
            inspection.inspector,
            inspection.timestamp,
            inspection.exists
        );
    }

    /// @notice Returns the consumer feedback record for a batch.
    function getFeedback(uint256 productId)
        external
        view
        returns (uint16 complaint, uint16 satisfaction, address buyer, uint256 timestamp, bool exists)
    {
        _requireProduct(productId);
        Feedback storage feedback = _feedback[productId];
        return (
            feedback.complaint,
            feedback.satisfaction,
            feedback.buyer,
            feedback.timestamp,
            feedback.exists
        );
    }

    /// @notice Returns whether the address participated in this product's journey.
    function isParticipant(uint256 productId, address stakeholder) public view returns (bool) {
        _requireProduct(productId);
        return
            stakeholder == product.farmerOf(productId) ||
            stakeholder == tracking.actorOf(productId, IReputationTracking.Status.PickedUp) ||
            stakeholder == tracking.actorOf(productId, IReputationTracking.Status.OnShelf);
    }

    /// @notice Computes delivery quality from registration and delivery timestamps.
    function deliveryScoreOf(uint256 productId) public view returns (uint256) {
        _requireProduct(productId);
        if (
            uint8(tracking.getCurrentStatus(productId)) <
            uint8(IReputationTracking.Status.Delivered)
        ) revert DeliveryNotAvailable();

        uint256 elapsed = tracking.actedAtOf(productId, IReputationTracking.Status.Delivered) -
            product.registeredAtOf(productId);
        return calculateDeliveryScore(elapsed, product.deliveryWindowOf(productId));
    }

    /// @notice Applies the delivery-window formula to an elapsed time and window.
    function calculateDeliveryScore(uint256 elapsed, uint256 deliveryWindow)
        public
        pure
        returns (uint256)
    {
        if (deliveryWindow == 0) revert InvalidDeliveryWindow();
        if (elapsed <= deliveryWindow) return 10000;
        if (elapsed - deliveryWindow >= deliveryWindow) return 0;
        return 10000 - ((elapsed - deliveryWindow) * 10000) / deliveryWindow;
    }

    /// @notice Returns configured quality, delivery, complaint, compliance and feedback weights.
    function weights() external view returns (uint256[5] memory) {
        return _weights;
    }

    /// @notice Returns the exponential moving-average alpha.
    function alpha() external view returns (uint256) {
        return _alpha;
    }

    /// @notice Returns the trust-level thresholds from lowest to highest.
    function thresholds() external view returns (uint256[4] memory) {
        return _thresholds;
    }

    /// @notice Returns the trust-level label for a basis-point score.
    function trustLevelForScore(uint256 scoreBps) public view returns (string memory) {
        if (scoreBps > 10000) revert InvalidScore();
        if (scoreBps >= _thresholds[3]) return "Excellent";
        if (scoreBps >= _thresholds[2]) return "Good";
        if (scoreBps >= _thresholds[1]) return "Average";
        if (scoreBps >= _thresholds[0]) return "Poor";
        return "Critical";
    }

    /// @notice Combines available components using normalized configured weights.
    function combine(
        uint256[5] memory values,
        uint256[5] memory componentWeights,
        bool[5] memory available
    ) public pure returns (uint256) {
        uint256 weightedTotal;
        uint256 availableWeight;
        for (uint256 index = 0; index < 5; index++) {
            if (values[index] > 10000) revert InvalidScore();
            if (available[index]) {
                weightedTotal += values[index] * componentWeights[index];
                availableWeight += componentWeights[index];
            }
        }
        if (availableWeight == 0) revert InvalidWeights();
        return weightedTotal / availableWeight;
    }

    /// @notice Sets weights whose total must equal 10,000 basis points.
    function setWeights(
        uint256 quality,
        uint256 delivery,
        uint256 complaint,
        uint256 compliance,
        uint256 feedback
    ) external {
        _requireAdmin();
        if (
            quality > 10000 ||
            delivery > 10000 ||
            complaint > 10000 ||
            compliance > 10000 ||
            feedback > 10000 ||
            quality + compliance == 0 ||
            quality + delivery + complaint + compliance + feedback != 10000
        ) revert InvalidWeights();
        _weights = [quality, delivery, complaint, compliance, feedback];
        emit WeightsUpdated(_weights);
    }

    /// @notice Sets the exponential moving-average alpha in the range 1..10,000.
    function setAlpha(uint256 newAlpha) external {
        _requireAdmin();
        if (newAlpha == 0 || newAlpha > 10000) revert InvalidAlpha();
        _alpha = newAlpha;
        emit AlphaUpdated(newAlpha);
    }

    /// @notice Sets four strictly increasing trust thresholds in basis points.
    function setThresholds(uint256 poor, uint256 average, uint256 good, uint256 excellent)
        external
    {
        _requireAdmin();
        if (
            poor >= average ||
            average >= good ||
            good >= excellent ||
            excellent > 10000
        ) revert InvalidThresholds();
        _thresholds = [poor, average, good, excellent];
        emit ThresholdsUpdated(_thresholds);
    }

    function _requireProduct(uint256 productId) private view {
        if (!product.exists(productId)) revert ProductNotFound();
    }

    function _requireInspector() private view {
        if (!registry.hasRole(registry.INSPECTOR_ROLE(), msg.sender)) revert Unauthorized();
    }

    function _requireAdmin() private view {
        if (!registry.isAdmin(msg.sender)) revert Unauthorized();
    }
}
