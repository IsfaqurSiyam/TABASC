// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract TrackingContract {

    // ── Enums ─────────────────────────────────────────────────────────────
    enum ShipmentStatus {
        Harvested,      // 0 - Farmer harvests
        PickedUp,       // 1 - Distributor picks up
        InTransit,      // 2 - On the way
        Delivered,      // 3 - Delivered to retailer
        OnShelf,        // 4 - Retailer puts on shelf
        Sold            // 5 - Sold to consumer
    }

    // ── Data structures ───────────────────────────────────────────────────
    struct ShipmentUpdate {
        uint256 productId;
        ShipmentStatus status;
        address updatedBy;
        string  location;
        string  notes;
        uint256 timestamp;
    }

    struct ProductLifecycle {
        uint256 productId;
        ShipmentUpdate[] updates;
        bool exists;
    }

    // ── State variables ───────────────────────────────────────────────────
    mapping(uint256 => ProductLifecycle) public lifecycles;

    // ── Events ────────────────────────────────────────────────────────────
    event ShipmentUpdated(
        uint256 indexed productId,
        ShipmentStatus  status,
        address indexed updatedBy,
        string          location,
        uint256         timestamp
    );

    // ── Functions ─────────────────────────────────────────────────────────

    // Add a new tracking update for a product
    function updateShipment(
        uint256 _productId,
        ShipmentStatus _status,
        string memory _location,
        string memory _notes
    ) public {
        if (!lifecycles[_productId].exists) {
            lifecycles[_productId].productId = _productId;
            lifecycles[_productId].exists = true;
        }

        ShipmentUpdate memory update = ShipmentUpdate({
            productId:  _productId,
            status:     _status,
            updatedBy:  msg.sender,
            location:   _location,
            notes:      _notes,
            timestamp:  block.timestamp
        });

        lifecycles[_productId].updates.push(update);

        emit ShipmentUpdated(
            _productId,
            _status,
            msg.sender,
            _location,
            block.timestamp
        );
    }

    // Get total number of updates for a product
    function getUpdateCount(uint256 _productId)
        public
        view
        returns (uint256)
    {
        return lifecycles[_productId].updates.length;
    }

    // Get a specific update by index
    function getUpdate(uint256 _productId, uint256 _index)
        public
        view
        returns (
            ShipmentStatus status,
            address        updatedBy,
            string memory  location,
            string memory  notes,
            uint256        timestamp
        )
    {
        require(
            _index < lifecycles[_productId].updates.length,
            "Update index out of range"
        );
        ShipmentUpdate memory u = lifecycles[_productId].updates[_index];
        return (u.status, u.updatedBy, u.location, u.notes, u.timestamp);
    }

    // Get current/latest status of a product
    function getCurrentStatus(uint256 _productId)
        public
        view
        returns (ShipmentStatus)
    {
        require(
            lifecycles[_productId].exists,
            "Product has no tracking history"
        );
        uint256 count = lifecycles[_productId].updates.length;
        return lifecycles[_productId].updates[count - 1].status;
    }

    // Get full history length for QR code display
    function getFullHistory(uint256 _productId)
        public
        view
        returns (uint256 count)
    {
        return lifecycles[_productId].updates.length;
    }
}