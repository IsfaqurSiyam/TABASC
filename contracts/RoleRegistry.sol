// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title RoleRegistry
/// @notice Stores the on-chain roles used by the TABASC supply-chain contracts.
contract RoleRegistry {
    bytes32 public constant FARMER_ROLE = keccak256("FARMER_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant RETAILER_ROLE = keccak256("RETAILER_ROLE");
    bytes32 public constant INSPECTOR_ROLE = keccak256("INSPECTOR_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    error Unauthorized();
    error InvalidAccount();
    error InvalidRole();
    error RoleAlreadyGranted();
    error RoleNotGranted();
    error AdminRoleProtected();

    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    /// @notice Makes the deployer the first administrator.
    constructor() {
        _roles[ADMIN_ROLE][msg.sender] = true;
        emit RoleGranted(ADMIN_ROLE, msg.sender, msg.sender);
    }

    /// @notice Grants a supported role to an account.
    /// @param role The role identifier.
    /// @param account The account receiving the role.
    function grantRole(bytes32 role, address account) external {
        _checkAdmin();
        if (!_isSupportedRole(role)) revert InvalidRole();
        if (account == address(0)) revert InvalidAccount();
        if (_roles[role][account]) revert RoleAlreadyGranted();
        _roles[role][account] = true;
        emit RoleGranted(role, account, msg.sender);
    }

    /// @notice Revokes a supported role from an account.
    /// @param role The role identifier.
    /// @param account The account losing the role.
    function revokeRole(bytes32 role, address account) external {
        _checkAdmin();
        if (!_isSupportedRole(role)) revert InvalidRole();
        if (account == address(0)) revert InvalidAccount();
        if (role == ADMIN_ROLE && account == msg.sender) revert AdminRoleProtected();
        if (!_roles[role][account]) revert RoleNotGranted();
        _roles[role][account] = false;
        emit RoleRevoked(role, account, msg.sender);
    }

    /// @notice Returns whether an account has a role.
    function hasRole(bytes32 role, address account) external view returns (bool) {
        return _roles[role][account];
    }

    /// @notice Returns whether an account is an administrator.
    function isAdmin(address account) external view returns (bool) {
        return _roles[ADMIN_ROLE][account];
    }

    /// @notice Returns the supported supply-chain roles held by an account.
    function getRoles(address account)
        external
        view
        returns (bool farmer, bool distributor, bool retailer, bool inspector, bool admin)
    {
        return (
            _roles[FARMER_ROLE][account],
            _roles[DISTRIBUTOR_ROLE][account],
            _roles[RETAILER_ROLE][account],
            _roles[INSPECTOR_ROLE][account],
            _roles[ADMIN_ROLE][account]
        );
    }

    function _checkAdmin() private view {
        if (!_roles[ADMIN_ROLE][msg.sender]) revert Unauthorized();
    }

    function _isSupportedRole(bytes32 role) private pure returns (bool) {
        return
            role == FARMER_ROLE ||
            role == DISTRIBUTOR_ROLE ||
            role == RETAILER_ROLE ||
            role == INSPECTOR_ROLE ||
            role == ADMIN_ROLE;
    }
}
