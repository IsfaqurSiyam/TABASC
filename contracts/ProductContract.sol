// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IProductRoleRegistry {
    function hasRole(bytes32 role, address account) external view returns (bool);
    function FARMER_ROLE() external view returns (bytes32);
}

/// @title ProductContract
/// @notice Registers unique batches and tracks their farmer and current custodian.
contract ProductContract {
    uint256 private constant MAX_DELIVERY_WINDOW = 365 days;

    struct Product {
        uint256 id;
        string name;
        string batchId;
        bytes32 dataHash;
        address farmer;
        address custodian;
        uint256 registeredAt;
        uint256 deliveryWindow;
    }

    IProductRoleRegistry public immutable registry;
    address public immutable deployer;
    address public trackingContract;
    uint256 public productCount;

    mapping(uint256 => Product) private _products;
    mapping(bytes32 => uint256) private _productIdByBatch;
    mapping(address => uint256[]) private _farmerProducts;

    error Unauthorized();
    error InvalidAddress();
    error EmptyField();
    error InvalidDataHash();
    error InvalidDeliveryWindow();
    error DuplicateBatch();
    error ProductNotFound();
    error TrackingContractAlreadySet();

    event ProductRegistered(
        uint256 indexed productId,
        string name,
        string batchId,
        bytes32 dataHash,
        address indexed farmer,
        uint256 deliveryWindow,
        uint256 registeredAt
    );
    event TrackingContractSet(address indexed trackingContract);
    event CustodianSet(uint256 indexed productId, address indexed from, address indexed to);

    /// @notice Connects the product ledger to its role registry.
    constructor(address registryAddress) {
        if (registryAddress == address(0)) revert InvalidAddress();
        registry = IProductRoleRegistry(registryAddress);
        deployer = msg.sender;
    }

    /// @notice Registers a unique product batch as a farmer.
    function registerProduct(
        string calldata name,
        string calldata batchId,
        bytes32 dataHash,
        uint256 deliveryWindow
    ) external returns (uint256 productId) {
        if (!registry.hasRole(registry.FARMER_ROLE(), msg.sender)) revert Unauthorized();
        if (bytes(name).length == 0 || bytes(batchId).length == 0) revert EmptyField();
        if (dataHash == bytes32(0)) revert InvalidDataHash();
        if (deliveryWindow == 0 || deliveryWindow > MAX_DELIVERY_WINDOW) {
            revert InvalidDeliveryWindow();
        }

        bytes32 batchKey = keccak256(bytes(batchId));
        if (_productIdByBatch[batchKey] != 0) revert DuplicateBatch();

        productId = ++productCount;
        _products[productId] = Product({
            id: productId,
            name: name,
            batchId: batchId,
            dataHash: dataHash,
            farmer: msg.sender,
            custodian: msg.sender,
            registeredAt: block.timestamp,
            deliveryWindow: deliveryWindow
        });
        _productIdByBatch[batchKey] = productId;
        _farmerProducts[msg.sender].push(productId);

        emit ProductRegistered(
            productId,
            name,
            batchId,
            dataHash,
            msg.sender,
            deliveryWindow,
            block.timestamp
        );
    }

    /// @notice Sets the tracking contract once, by the deployment account.
    function setTrackingContract(address trackingAddress) external {
        if (msg.sender != deployer) revert Unauthorized();
        if (trackingContract != address(0)) revert TrackingContractAlreadySet();
        if (trackingAddress == address(0)) revert InvalidAddress();
        trackingContract = trackingAddress;
        emit TrackingContractSet(trackingAddress);
    }

    /// @notice Updates custody after the tracking contract validates a handover.
    function setCustodian(uint256 productId, address custodian) external {
        if (msg.sender != trackingContract || trackingContract == address(0)) revert Unauthorized();
        _requireProduct(productId);
        if (custodian == address(0)) revert InvalidAddress();
        address previousCustodian = _products[productId].custodian;
        if (custodian == previousCustodian) revert InvalidAddress();
        _products[productId].custodian = custodian;
        emit CustodianSet(productId, previousCustodian, custodian);
    }

    /// @notice Returns whether a product identifier exists.
    function exists(uint256 productId) external view returns (bool) {
        return productId != 0 && productId <= productCount;
    }

    /// @notice Returns the complete product record.
    function getProduct(uint256 productId) external view returns (Product memory) {
        _requireProduct(productId);
        return _products[productId];
    }

    /// @notice Resolves a registered batch identifier to its product identifier.
    function getProductIdByBatch(string calldata batchId) external view returns (uint256) {
        uint256 productId = _productIdByBatch[keccak256(bytes(batchId))];
        if (productId == 0) revert ProductNotFound();
        return productId;
    }

    /// @notice Returns product identifiers originally registered by a farmer.
    function getFarmerProducts(address farmer) external view returns (uint256[] memory) {
        return _farmerProducts[farmer];
    }

    function farmerOf(uint256 productId) external view returns (address) {
        _requireProduct(productId);
        return _products[productId].farmer;
    }

    function custodianOf(uint256 productId) external view returns (address) {
        _requireProduct(productId);
        return _products[productId].custodian;
    }

    function registeredAtOf(uint256 productId) external view returns (uint256) {
        _requireProduct(productId);
        return _products[productId].registeredAt;
    }

    function deliveryWindowOf(uint256 productId) external view returns (uint256) {
        _requireProduct(productId);
        return _products[productId].deliveryWindow;
    }

    function dataHashOf(uint256 productId) external view returns (bytes32) {
        _requireProduct(productId);
        return _products[productId].dataHash;
    }

    function batchIdOf(uint256 productId) external view returns (string memory) {
        _requireProduct(productId);
        return _products[productId].batchId;
    }

    function _requireProduct(uint256 productId) private view {
        if (productId == 0 || productId > productCount) revert ProductNotFound();
    }
}
