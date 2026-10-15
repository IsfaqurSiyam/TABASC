// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract ReputationContract {

    // ── Data structures ───────────────────────────────────────────────────

    // Scores are 0-10, stored as integers
    // We multiply by 100 internally to avoid decimals
    // Final RS is out of 1000 (10 * 100)
    struct ReputationScore {
        uint8   qualityScore;       // Q  - Inspector score 0-10
        uint8   deliveryScore;      // D  - 0-10
        uint8   complaintScore;     // CH - 0-10 (10 = no complaints)
        uint8   complianceScore;    // RC - 0-10
        uint8   feedbackScore;      // CF - Consumer score 0-10
        uint256 finalScore;         // RS result (0-1000)
        uint256 lastUpdated;
        uint256 totalBatches;
        bool    exists;
    }

    struct ScoreHistory {
        uint256 finalScore;
        uint256 timestamp;
        string  batchId;
    }

    // ── State variables ───────────────────────────────────────────────────
    mapping(address => ReputationScore) public reputationScores;
    mapping(address => ScoreHistory[])  public scoreHistory;
    mapping(address => bool)            public inspectors;
    mapping(address => uint256) private consumerFeedbackTotal;
    mapping(address => uint256) private consumerFeedbackCount;
    mapping(address => mapping(bytes32 => bool)) private processedReviews;
    mapping(address => mapping(bytes32 => bool)) private countedBatches;

    address public admin;

    // ── Events ────────────────────────────────────────────────────────────
    event ReputationUpdated(
        address indexed stakeholder,
        uint256 finalScore,
        string  batchId,
        uint256 timestamp
    );

    event InspectorAdded(address indexed inspector);
    event InspectorRemoved(address indexed inspector);

    // ── Modifiers ─────────────────────────────────────────────────────────
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this");
        _;
    }

    modifier onlyInspector() {
        require(
            inspectors[msg.sender] || msg.sender == admin,
            "Only inspector can call this"
        );
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────
    constructor() {
        admin = msg.sender;
        inspectors[msg.sender] = true;
    }

    // ── Admin functions ───────────────────────────────────────────────────
    function addInspector(address _inspector) public onlyAdmin {
        inspectors[_inspector] = true;
        emit InspectorAdded(_inspector);
    }

    function removeInspector(address _inspector) public onlyAdmin {
        inspectors[_inspector] = false;
        emit InspectorRemoved(_inspector);
    }

    // ── Core MFSRS function ───────────────────────────────────────────────
    // Called by inspector after each batch
    // All scores 0-10
    function calculateAndUpdateScore(
        address _stakeholder,
        uint8   _qualityScore,
        uint8   _deliveryScore,
        uint8   _complaintScore,
        uint8   _complianceScore,
        uint8   _feedbackScore,
        string memory _batchId
    ) public onlyInspector {

        // Validate all scores are 0-10
        require(_qualityScore    <= 10, "Quality score must be 0-10");
        require(_deliveryScore   <= 10, "Delivery score must be 0-10");
        require(_complaintScore  <= 10, "Complaint score must be 0-10");
        require(_complianceScore <= 10, "Compliance score must be 0-10");
        require(_feedbackScore   <= 10, "Feedback score must be 0-10");

        // ── MFSRS Formula ─────────────────────────────────────────────
        // RS = (Q×0.30) + (D×0.25) + (CH×0.20) + (RC×0.15) + (CF×0.10)
        // Multiply weights by 100 to avoid decimals:
        // RS = (Q×30 + D×25 + CH×20 + RC×15 + CF×10) / 100
        // Result is out of 1000 (max score when all = 10)
        uint8 effectiveFeedbackScore = _getFeedbackScore(
            _stakeholder,
            _feedbackScore
        );
        uint256 rs = _calculateFinalScore(
            _qualityScore,
            _deliveryScore,
            _complaintScore,
            _complianceScore,
            effectiveFeedbackScore
        );

        // Store the score
        reputationScores[_stakeholder] = ReputationScore({
            qualityScore:    _qualityScore,
            deliveryScore:   _deliveryScore,
            complaintScore:  _complaintScore,
            complianceScore: _complianceScore,
            feedbackScore:   effectiveFeedbackScore,
            finalScore:      rs,
            lastUpdated:     block.timestamp,
            totalBatches:    _countBatch(_stakeholder, _batchId),
            exists:          true
        });

        // Store in history
        scoreHistory[_stakeholder].push(ScoreHistory({
            finalScore: rs,
            timestamp:  block.timestamp,
            batchId:    _batchId
        }));

        emit ReputationUpdated(
            _stakeholder,
            rs,
            _batchId,
            block.timestamp
        );
    }

    function recordConsumerReview(
        address _stakeholder,
        uint8 _rating,
        string memory _batchId,
        string memory _reviewKey
    ) public onlyInspector {
        require(_rating >= 1 && _rating <= 10, "Rating must be 1-10");
        require(bytes(_reviewKey).length > 0, "Review key is required");

        bytes32 reviewHash = keccak256(bytes(_reviewKey));
        require(!processedReviews[_stakeholder][reviewHash], "Review already recorded");
        processedReviews[_stakeholder][reviewHash] = true;

        consumerFeedbackTotal[_stakeholder] += _rating;
        consumerFeedbackCount[_stakeholder] += 1;
        uint8 feedbackScore = _getFeedbackScore(_stakeholder, 5);

        ReputationScore storage current = reputationScores[_stakeholder];
        uint8 qualityScore = current.exists ? current.qualityScore : 5;
        uint8 deliveryScore = current.exists ? current.deliveryScore : 5;
        uint8 complaintScore = current.exists ? current.complaintScore : 5;
        uint8 complianceScore = current.exists ? current.complianceScore : 5;
        uint256 finalScore = _calculateFinalScore(
            qualityScore,
            deliveryScore,
            complaintScore,
            complianceScore,
            feedbackScore
        );

        reputationScores[_stakeholder] = ReputationScore({
            qualityScore:    qualityScore,
            deliveryScore:   deliveryScore,
            complaintScore:  complaintScore,
            complianceScore: complianceScore,
            feedbackScore:   feedbackScore,
            finalScore:      finalScore,
            lastUpdated:     block.timestamp,
            totalBatches:    _countBatch(_stakeholder, _batchId),
            exists:          true
        });

        scoreHistory[_stakeholder].push(ScoreHistory({
            finalScore: finalScore,
            timestamp: block.timestamp,
            batchId: _batchId
        }));

        emit ReputationUpdated(
            _stakeholder,
            finalScore,
            _batchId,
            block.timestamp
        );
    }

    function _getFeedbackScore(address _stakeholder, uint8 _fallback)
        private
        view
        returns (uint8)
    {
        uint256 count = consumerFeedbackCount[_stakeholder];
        if (count == 0) return _fallback;
        return uint8((consumerFeedbackTotal[_stakeholder] + count / 2) / count);
    }

    function _countBatch(address _stakeholder, string memory _batchId)
        private
        returns (uint256 totalBatches)
    {
        totalBatches = reputationScores[_stakeholder].totalBatches;
        bytes32 batchHash = keccak256(bytes(_batchId));
        if (!countedBatches[_stakeholder][batchHash]) {
            countedBatches[_stakeholder][batchHash] = true;
            totalBatches += 1;
        }
    }

    function _calculateFinalScore(
        uint8 _qualityScore,
        uint8 _deliveryScore,
        uint8 _complaintScore,
        uint8 _complianceScore,
        uint8 _feedbackScore
    ) private pure returns (uint256) {
        return
            (uint256(_qualityScore) * 30) +
            (uint256(_deliveryScore) * 25) +
            (uint256(_complaintScore) * 20) +
            (uint256(_complianceScore) * 15) +
            (uint256(_feedbackScore) * 10);
    }

    // ── View functions ────────────────────────────────────────────────────

    // Get current reputation score of a stakeholder
    function getReputationScore(address _stakeholder)
        public
        view
        returns (
            uint8   qualityScore,
            uint8   deliveryScore,
            uint8   complaintScore,
            uint8   complianceScore,
            uint8   feedbackScore,
            uint256 finalScore,
            uint256 lastUpdated,
            uint256 totalBatches
        )
    {
        require(
            reputationScores[_stakeholder].exists,
            "No reputation record found"
        );
        ReputationScore memory r = reputationScores[_stakeholder];
        return (
            r.qualityScore,
            r.deliveryScore,
            r.complaintScore,
            r.complianceScore,
            r.feedbackScore,
            r.finalScore,
            r.lastUpdated,
            r.totalBatches
        );
    }

    // Get trust level label based on score
    // Score is out of 1000
    function getTrustLevel(address _stakeholder)
        public
        view
        returns (string memory)
    {
        require(
            reputationScores[_stakeholder].exists,
            "No reputation record found"
        );
        uint256 score = reputationScores[_stakeholder].finalScore;

        if (score >= 800)      return "Excellent";
        else if (score >= 600) return "Good";
        else if (score >= 400) return "Average";
        else if (score >= 200) return "Poor";
        else                   return "Critical";
    }

    // Get score history count
    function getHistoryCount(address _stakeholder)
        public
        view
        returns (uint256)
    {
        return scoreHistory[_stakeholder].length;
    }

    // Get specific history entry
    function getHistoryEntry(address _stakeholder, uint256 _index)
        public
        view
        returns (
            uint256 finalScore,
            uint256 timestamp,
            string memory batchId
        )
    {
        require(
            _index < scoreHistory[_stakeholder].length,
            "Index out of range"
        );
        ScoreHistory memory h = scoreHistory[_stakeholder][_index];
        return (h.finalScore, h.timestamp, h.batchId);
    }
}