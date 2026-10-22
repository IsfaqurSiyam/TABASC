// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface ITrackingRoleRegistry {
    function hasRole(bytes32 role, address account) external view returns (bool);
    function FARMER_ROLE() external view returns (bytes32);
    function DISTRIBUTOR_ROLE() external view returns (bytes32);
    function RETAILER_ROLE() external view returns (bytes32);
    function INSPECTOR_ROLE() external view returns (bytes32);
}

interface ITrackingProduct {
    function exists(uint256 productId) external view returns (bool);
    function farmerOf(uint256 productId) external view returns (address);
    function custodianOf(uint256 productId) external view returns (address);
    function setCustodian(uint256 productId, address custodian) external;
    function registeredAtOf(uint256 productId) external view returns (uint256);
    function dataHashOf(uint256 productId) external view returns (bytes32);
}

/// @title TrackingContract
/// @notice Enforces forward-only shipment updates, custody and safety recalls.
contract TrackingContract {
    uint256 private constant MAX_LOCATION_BYTES = 120;
    uint256 private constant MAX_NOTES_BYTES = 500;
    uint256 private constant MAX_RECALL_REASON_BYTES = 500;
    uint256 private constant MAX_CARE_EXPLANATION_BYTES = 500;
    uint256 private constant MIN_CARE_ISSUE_EXPLANATION_BYTES = 20;

    enum Status {
        Harvested,
        PickedUp,
        InTransit,
        Delivered,
        OnShelf,
        Sold
    }

    struct Update {
        Status status;
        address updatedBy;
        string location;
        string notes;
        bytes32 dataHash;
        uint256 timestamp;
    }

    struct CareAttestation {
        address distributor;
        address retailer;
        uint256 storedSince;
        uint256 handedOverAt;
        uint256 storageDays;
        uint256 storageSeconds;
        bool temperatureMaintained;
        bool packagingIntact;
        bool hygieneMaintained;
        bool noDamageOrSpoilage;
        string explanation;
        bytes32 detailsHash;
    }

    ITrackingRoleRegistry public immutable registry;
    ITrackingProduct public immutable product;

    mapping(uint256 => Status) private _currentStatus;
    mapping(uint256 => Update[]) private _history;
    mapping(uint256 => bool) private _historyInitialized;
    mapping(uint256 => mapping(Status => address)) private _actors;
    mapping(uint256 => mapping(Status => uint256)) private _actedAt;
    mapping(uint256 => bool) private _recalled;
    mapping(uint256 => string) private _recallReason;
    mapping(uint256 => address) private _buyers;
    mapping(uint256 => CareAttestation) private _careAttestations;
    mapping(uint256 => bool) private _hasCareAttestation;

    error Unauthorized();
    error ProductNotFound();
    error InvalidAddress();
    error InvalidRecipientRole();
    error InvalidHandoverStatus();
    error SameCustodian();
    error InvalidNextStatus();
    error EmptyLocation();
    error FieldTooLong();
    error ProductRecalled();
    error AlreadyRecalled();
    error EmptyRecallReason();
    error BuyerAlreadyRecorded();
    error BuyerNotRecorded();
    error InvalidBuyer();
    error InvalidStatus();
    error CareAttestationRequired();
    error CareAttestationAlreadyExists();
    error EmptyCareExplanation();
    error CareIssueExplanationTooShort();

    event ShipmentUpdated(
        uint256 indexed productId,
        Status indexed status,
        address indexed updatedBy,
        string location,
        string notes,
        bytes32 dataHash,
        uint256 timestamp
    );
    event CustodianTransferred(
        uint256 indexed productId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );
    event BuyerRecorded(uint256 indexed productId, address indexed buyer, address indexed retailer);
    event RecallIssued(uint256 indexed productId, address indexed inspector, string reason, uint256 timestamp);
    event CareAttestationRecorded(
        uint256 indexed productId,
        address indexed distributor,
        address indexed retailer,
        uint256 storedSince,
        uint256 handedOverAt,
        uint256 storageDays,
        uint256 storageSeconds,
        bool temperatureMaintained,
        bool packagingIntact,
        bool hygieneMaintained,
        bool noDamageOrSpoilage,
        string explanation,
        bytes32 detailsHash
    );

    /// @notice Connects tracking to the registry and product ledger.
    constructor(address registryAddress, address productAddress) {
        if (registryAddress == address(0) || productAddress == address(0)) revert InvalidAddress();
        registry = ITrackingRoleRegistry(registryAddress);
        product = ITrackingProduct(productAddress);
    }

    /// @notice Transfers custody from a farmer to a distributor or from a
    /// distributor to a retailer at the appropriate lifecycle boundary.
    function handover(uint256 productId, address to) external {
        _requireProduct(productId);
        _requireNotRecalled(productId);
        if (msg.sender != product.custodianOf(productId)) revert Unauthorized();
        if (to == address(0)) revert InvalidAddress();
        if (to == msg.sender) revert SameCustodian();

        Status current = _currentStatus[productId];
        if (current == Status.Harvested) {
            if (!registry.hasRole(registry.FARMER_ROLE(), msg.sender)) revert Unauthorized();
            if (!registry.hasRole(registry.DISTRIBUTOR_ROLE(), to)) revert InvalidRecipientRole();
        } else {
            if (current == Status.Delivered) revert CareAttestationRequired();
            revert InvalidHandoverStatus();
        }

        product.setCustodian(productId, to);
        emit CustodianTransferred(productId, msg.sender, to, block.timestamp);
    }

    /// @notice Records distributor storage conditions and transfers custody to a retailer.
    function handoverWithCare(
        uint256 productId,
        address to,
        bool[4] calldata careFlags,
        string calldata explanation
    ) external {
        _requireProduct(productId);
        _requireNotRecalled(productId);
        if (_hasCareAttestation[productId]) revert CareAttestationAlreadyExists();
        if (msg.sender != product.custodianOf(productId)) revert Unauthorized();
        if (!registry.hasRole(registry.DISTRIBUTOR_ROLE(), msg.sender)) revert Unauthorized();
        if (_currentStatus[productId] != Status.Delivered) revert InvalidHandoverStatus();
        if (to == address(0)) revert InvalidAddress();
        if (to == msg.sender) revert SameCustodian();
        if (!registry.hasRole(registry.RETAILER_ROLE(), to)) revert InvalidRecipientRole();
        CareAttestation memory attestation = _createCareAttestation(
            productId,
            to,
            careFlags,
            explanation
        );
        _careAttestations[productId] = attestation;
        _hasCareAttestation[productId] = true;
        product.setCustodian(productId, to);
        emit CustodianTransferred(productId, msg.sender, to, attestation.handedOverAt);
        _emitCareAttestation(productId, attestation);
    }

    /// @notice Records the next shipment status for the current custodian.
    function updateShipment(
        uint256 productId,
        Status next,
        string calldata location,
        string calldata notes,
        bytes32 dataHash
    ) external {
        _requireProduct(productId);
        _requireNotRecalled(productId);
        if (msg.sender != product.custodianOf(productId)) revert Unauthorized();
        if (bytes(location).length == 0) revert EmptyLocation();
        if (
            bytes(location).length > MAX_LOCATION_BYTES ||
            bytes(notes).length > MAX_NOTES_BYTES
        ) revert FieldTooLong();
        if (uint8(next) != uint8(_currentStatus[productId]) + 1) revert InvalidNextStatus();

        if (
            next == Status.PickedUp ||
            next == Status.InTransit ||
            next == Status.Delivered
        ) {
            if (!registry.hasRole(registry.DISTRIBUTOR_ROLE(), msg.sender)) revert Unauthorized();
        } else if (next == Status.OnShelf || next == Status.Sold) {
            if (!registry.hasRole(registry.RETAILER_ROLE(), msg.sender)) revert Unauthorized();
        } else {
            revert InvalidNextStatus();
        }

        _initializeHistory(productId);
        _currentStatus[productId] = next;
        _actors[productId][next] = msg.sender;
        _actedAt[productId][next] = block.timestamp;
        _history[productId].push(
            Update({
                status: next,
                updatedBy: msg.sender,
                location: location,
                notes: notes,
                dataHash: dataHash,
                timestamp: block.timestamp
            })
        );
        emit ShipmentUpdated(productId, next, msg.sender, location, notes, dataHash, block.timestamp);
    }

    /// @notice Records the consumer address for a sold product exactly once.
    function recordBuyer(uint256 productId, address buyer) external {
        _requireProduct(productId);
        _requireNotRecalled(productId);
        if (msg.sender != product.custodianOf(productId)) revert Unauthorized();
        if (!registry.hasRole(registry.RETAILER_ROLE(), msg.sender)) revert Unauthorized();
        if (_currentStatus[productId] != Status.Sold) revert InvalidHandoverStatus();
        if (_buyers[productId] != address(0)) revert BuyerAlreadyRecorded();
        if (buyer == address(0) || buyer == msg.sender) revert InvalidBuyer();
        _buyers[productId] = buyer;
        emit BuyerRecorded(productId, buyer, msg.sender);
    }

    /// @notice Blocks future movement of an unsafe product.
    function recall(uint256 productId, string calldata reason) external {
        _requireProduct(productId);
        if (!registry.hasRole(registry.INSPECTOR_ROLE(), msg.sender)) revert Unauthorized();
        if (_recalled[productId]) revert AlreadyRecalled();
        if (bytes(reason).length == 0) revert EmptyRecallReason();
        if (bytes(reason).length > MAX_RECALL_REASON_BYTES) revert FieldTooLong();
        _recalled[productId] = true;
        _recallReason[productId] = reason;
        emit RecallIssued(productId, msg.sender, reason, block.timestamp);
    }

    /// @notice Returns the current status; a registered product starts Harvested.
    function getCurrentStatus(uint256 productId) external view returns (Status) {
        _requireProduct(productId);
        return _currentStatus[productId];
    }

    /// @notice Returns the complete journey, including the registration state.
    function getHistory(uint256 productId) external view returns (Update[] memory history) {
        _requireProduct(productId);
        if (_historyInitialized[productId]) return _history[productId];

        history = new Update[](1);
        history[0] = Update({
            status: Status.Harvested,
            updatedBy: product.farmerOf(productId),
            location: "",
            notes: "",
            dataHash: product.dataHashOf(productId),
            timestamp: product.registeredAtOf(productId)
        });
    }

    /// @notice Returns the number of journey states, including Harvested.
    function getUpdateCount(uint256 productId) external view returns (uint256) {
        _requireProduct(productId);
        return _history[productId].length + (_historyInitialized[productId] ? 0 : 1);
    }

    /// @notice Returns the actor recorded for a lifecycle status, or zero.
    function actorOf(uint256 productId, Status status) external view returns (address) {
        _requireProduct(productId);
        if (uint8(status) > uint8(Status.Sold)) revert InvalidStatus();
        if (status == Status.Harvested) return product.farmerOf(productId);
        return _actors[productId][status];
    }

    /// @notice Returns the time recorded for a lifecycle status, or zero.
    function actedAtOf(uint256 productId, Status status) external view returns (uint256) {
        _requireProduct(productId);
        if (uint8(status) > uint8(Status.Sold)) revert InvalidStatus();
        if (status == Status.Harvested) return product.registeredAtOf(productId);
        return _actedAt[productId][status];
    }

    /// @notice Returns the recorded buyer, reverting until one is recorded.
    function buyerOf(uint256 productId) external view returns (address) {
        _requireProduct(productId);
        address buyer = _buyers[productId];
        if (buyer == address(0)) revert BuyerNotRecorded();
        return buyer;
    }

    /// @notice Returns whether a product has been recalled.
    function isRecalled(uint256 productId) external view returns (bool) {
        _requireProduct(productId);
        return _recalled[productId];
    }

    /// @notice Returns the reason recorded by an inspector recall.
    function recallReasonOf(uint256 productId) external view returns (string memory) {
        _requireProduct(productId);
        return _recallReason[productId];
    }

    /// @notice Returns the immutable distributor care attestation for a product.
    function getCareAttestation(uint256 productId) external view returns (CareAttestation memory) {
        _requireProduct(productId);
        if (!_hasCareAttestation[productId]) revert InvalidHandoverStatus();
        return _careAttestations[productId];
    }

    /// @notice Returns whether the distributor has recorded its care attestation.
    function hasCareAttestation(uint256 productId) external view returns (bool) {
        _requireProduct(productId);
        return _hasCareAttestation[productId];
    }

    function _initializeHistory(uint256 productId) private {
        if (_historyInitialized[productId]) return;
        _historyInitialized[productId] = true;
        address farmer = product.farmerOf(productId);
        uint256 registeredAt = product.registeredAtOf(productId);
        _actors[productId][Status.Harvested] = farmer;
        _actedAt[productId][Status.Harvested] = registeredAt;
        _history[productId].push(
            Update({
                status: Status.Harvested,
                updatedBy: farmer,
                location: "",
                notes: "",
                dataHash: product.dataHashOf(productId),
                timestamp: registeredAt
            })
        );
        emit ShipmentUpdated(
            productId,
            Status.Harvested,
            farmer,
            "",
            "",
            product.dataHashOf(productId),
            registeredAt
        );
    }

    function _requireProduct(uint256 productId) private view {
        if (!product.exists(productId)) revert ProductNotFound();
    }

    function _requireNotRecalled(uint256 productId) private view {
        if (_recalled[productId]) revert ProductRecalled();
    }

    function _hasNonWhitespace(string calldata value) private pure returns (bool) {
        bytes calldata text = bytes(value);
        for (uint256 i; i < text.length; i++) {
            if (text[i] != 0x20 && text[i] != 0x09 && text[i] != 0x0a && text[i] != 0x0d) {
                return true;
            }
        }
        return false;
    }

    function _createCareAttestation(
        uint256 productId,
        address to,
        bool[4] calldata careFlags,
        string calldata explanation
    ) private view returns (CareAttestation memory attestation) {
        if (!_hasNonWhitespace(explanation)) revert EmptyCareExplanation();
        if (bytes(explanation).length > MAX_CARE_EXPLANATION_BYTES) revert FieldTooLong();
        if (
            (!careFlags[0] || !careFlags[1] || !careFlags[2] || !careFlags[3]) &&
            bytes(explanation).length < MIN_CARE_ISSUE_EXPLANATION_BYTES
        ) revert CareIssueExplanationTooShort();

        attestation.distributor = msg.sender;
        attestation.retailer = to;
        attestation.storedSince = _actedAt[productId][Status.Delivered];
        attestation.handedOverAt = block.timestamp;
        attestation.storageSeconds = attestation.handedOverAt - attestation.storedSince;
        attestation.storageDays = attestation.storageSeconds / 1 days;
        attestation.temperatureMaintained = careFlags[0];
        attestation.packagingIntact = careFlags[1];
        attestation.hygieneMaintained = careFlags[2];
        attestation.noDamageOrSpoilage = careFlags[3];
        attestation.explanation = explanation;
        attestation.detailsHash = keccak256(abi.encode(
            productId,
            attestation.distributor,
            attestation.retailer,
            attestation.storedSince,
            attestation.handedOverAt,
            attestation.storageDays,
            attestation.storageSeconds,
            careFlags,
            explanation
        ));
    }

    function _emitCareAttestation(uint256 productId, CareAttestation memory attestation) private {
        emit CareAttestationRecorded(
            productId,
            attestation.distributor,
            attestation.retailer,
            attestation.storedSince,
            attestation.handedOverAt,
            attestation.storageDays,
            attestation.storageSeconds,
            attestation.temperatureMaintained,
            attestation.packagingIntact,
            attestation.hygieneMaintained,
            attestation.noDamageOrSpoilage,
            attestation.explanation,
            attestation.detailsHash
        );
    }
}
