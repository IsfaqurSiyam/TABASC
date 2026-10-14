// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ProductContract {

    // ── Data structures ───────────────────────────────────────────────────
    struct Product {
        uint256 id;
        string  name;
        string  batchId;
        address farmer;
        uint256 timestamp;
        bool    isActive;
    }

    // ── State variables ───────────────────────────────────────────────────
    uint256 public productCount = 0;

    mapping(uint256 => Product) public products;
    mapping(address => uint256[]) public farmerProducts;

    // ── Events ────────────────────────────────────────────────────────────
    event ProductRegistered(
        uint256 indexed productId,
        string  name,
        string  batchId,
        address indexed farmer,
        uint256 timestamp
    );

    event OwnershipTransferred(
        uint256 indexed productId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );

    // ── Functions ─────────────────────────────────────────────────────────

    // Register a new product (called by Farmer)
    function registerProduct(
        string memory _name,
        string memory _batchId
    ) public returns (uint256) {
        productCount++;

        products[productCount] = Product({
            id:        productCount,
            name:      _name,
            batchId:   _batchId,
            farmer:    msg.sender,
            timestamp: block.timestamp,
            isActive:  true
        });

        farmerProducts[msg.sender].push(productCount);

        emit ProductRegistered(
            productCount,
            _name,
            _batchId,
            msg.sender,
            block.timestamp
        );

        return productCount;
    }

    // Transfer product ownership (Farmer → Distributor → Retailer)
    function transferOwnership(
        uint256 _productId,
        address _newOwner
    ) public {
        require(_productId <= productCount, "Product does not exist");
        require(
            products[_productId].farmer == msg.sender,
            "Only current owner can transfer"
        );
        require(_newOwner != address(0), "Invalid new owner address");

        address previousOwner = products[_productId].farmer;
        products[_productId].farmer = _newOwner;

        farmerProducts[_newOwner].push(_productId);

        emit OwnershipTransferred(
            _productId,
            previousOwner,
            _newOwner,
            block.timestamp
        );
    }

    // Get a single product by ID
    function getProduct(uint256 _productId)
        public
        view
        returns (
            uint256 id,
            string memory name,
            string memory batchId,
            address farmer,
            uint256 timestamp,
            bool isActive
        )
    {
        require(_productId <= productCount, "Product does not exist");
        Product memory p = products[_productId];
        return (p.id, p.name, p.batchId, p.farmer, p.timestamp, p.isActive);
    }

    // Get all product IDs belonging to a farmer
    function getFarmerProducts(address _farmer)
        public
        view
        returns (uint256[] memory)
    {
        return farmerProducts[_farmer];
    }

    // Get total number of registered products
    function getProductCount() public view returns (uint256) {
        return productCount;
    }
}