// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title UBI Revenue Tracker
 * @notice Aggregate per-protocol fee accounting for the UBI Impact Dashboard.
 *         Each registered protocol reports its cumulative UBI contributions.
 *         Purely read-layer — does NOT move funds (UBIFeeSplitter handles that).
 *
 *         Frontend queries this to render per-protocol breakdown: how much each
 *         dApp (swaps, perps, predict, lend, stable, stocks, bridge) has sent
 *         to the UBI pool.
 */

interface IUBIFeeSplitterStats {
    function totalFeesCollected() external view returns (uint256);
    function totalUBIFunded() external view returns (uint256);
    function dAppCount() external view returns (uint256);
}

contract UBIRevenueTracker {
    // ============ Types ============

    struct ProtocolStats {
        string name;           // e.g. "GoodSwap", "GoodPerps"
        string category;       // e.g. "swap", "perps", "predict"
        address feeSource;     // contract that pays fees
        uint256 totalFees;     // cumulative fees collected (in G$ or wei)
        uint256 ubiContribution; // cumulative UBI portion
        uint256 txCount;       // number of fee-generating transactions
        uint256 lastUpdateBlock;
        bool active;
    }

    struct Snapshot {
        uint256 timestamp;
        uint256 totalUBI;      // aggregate UBI at this point
        uint256 totalFees;     // aggregate fees at this point
        uint256 protocolCount; // how many protocols active
    }

    // ============ State ============

    address public admin;
    IUBIFeeSplitterStats public feeSplitter;

    /// @notice Protocol registry by ID
    mapping(uint256 => ProtocolStats) public protocols;
    uint256 public protocolCount;

    /// @notice Reverse lookup: feeSource address → protocol ID
    mapping(address => uint256) public protocolBySource;

    /// @notice Daily snapshots for charting (day index → snapshot)
    mapping(uint256 => Snapshot) public dailySnapshots;
    uint256 public snapshotCount;

    /// @notice Global aggregates
    uint256 public totalUBITracked;
    uint256 public totalFeesTracked;
    uint256 public totalTxTracked;

    // ============ Events ============

    event ProtocolRegistered(uint256 indexed id, string name, string category, address feeSource);
    event StatsUpdated(uint256 indexed protocolId, uint256 fees, uint256 ubi, uint256 txCount);
    event DailySnapshot(uint256 indexed day, uint256 totalUBI, uint256 totalFees);

    // ============ Modifiers ============

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    // ============ Constructor ============

    constructor(address _admin, address _feeSplitter) {
        admin = _admin;
        feeSplitter = IUBIFeeSplitterStats(_feeSplitter);
    }

    // ============ Protocol Management ============

    /**
     * @notice Register a new protocol for tracking.
     * @param name      Human-readable name (e.g. "GoodSwap")
     * @param category  Category slug (e.g. "swap")
     * @param feeSource Contract address that generates fees
     */
    function registerProtocol(
        string calldata name,
        string calldata category,
        address feeSource
    ) external onlyAdmin returns (uint256 id) {
        id = protocolCount++;
        protocols[id] = ProtocolStats({
            name: name,
            category: category,
            feeSource: feeSource,
            totalFees: 0,
            ubiContribution: 0,
            txCount: 0,
            lastUpdateBlock: block.number,
            active: true
        });
        protocolBySource[feeSource] = id;
        emit ProtocolRegistered(id, name, category, feeSource);
    }

    /**
     * @notice Report fee activity for a protocol. Called by keepers/bots.
     * @param protocolId  Which protocol
     * @param fees        New fees since last report (G$ units)
     * @param ubi         New UBI portion since last report
     * @param txs         Number of new transactions
     */
    function reportFees(
        uint256 protocolId,
        uint256 fees,
        uint256 ubi,
        uint256 txs
    ) external onlyAdmin {
        require(protocolId < protocolCount, "Invalid protocol");
        ProtocolStats storage p = protocols[protocolId];
        require(p.active, "Protocol inactive");

        p.totalFees += fees;
        p.ubiContribution += ubi;
        p.txCount += txs;
        p.lastUpdateBlock = block.number;

        totalFeesTracked += fees;
        totalUBITracked += ubi;
        totalTxTracked += txs;

        emit StatsUpdated(protocolId, fees, ubi, txs);
    }

    /**
     * @notice Take a daily snapshot for historical charting.
     */
    function takeSnapshot() external onlyAdmin {
        uint256 day = snapshotCount++;
        dailySnapshots[day] = Snapshot({
            timestamp: block.timestamp,
            totalUBI: totalUBITracked,
            totalFees: totalFeesTracked,
            protocolCount: _activeCount()
        });
        emit DailySnapshot(day, totalUBITracked, totalFeesTracked);
    }

    // ============ Views ============

    /**
     * @notice Get full stats for a protocol.
     */
    function getProtocol(uint256 id) external view returns (ProtocolStats memory) {
        require(id < protocolCount, "Invalid protocol");
        return protocols[id];
    }

    /**
     * @notice Get all protocols in a single call (for frontend).
     */
    function getAllProtocols() external view returns (ProtocolStats[] memory result) {
        result = new ProtocolStats[](protocolCount);
        for (uint256 i = 0; i < protocolCount; i++) {
            result[i] = protocols[i];
        }
    }

    /**
     * @notice Get recent snapshots for charting.
     * @param count Number of most recent snapshots to return
     */
    function getSnapshots(uint256 count) external view returns (Snapshot[] memory result) {
        uint256 start = snapshotCount > count ? snapshotCount - count : 0;
        uint256 len = snapshotCount - start;
        result = new Snapshot[](len);
        for (uint256 i = 0; i < len; i++) {
            result[i] = dailySnapshots[start + i];
        }
    }

    /**
     * @notice Aggregate dashboard data in a single call.
     */
    function getDashboardData() external view returns (
        uint256 _totalFees,
        uint256 _totalUBI,
        uint256 _totalTx,
        uint256 _protocolCount,
        uint256 _activeProtocols,
        uint256 _splitterFees,
        uint256 _splitterUBI,
        uint256 _snapshotCount
    ) {
        _totalFees = totalFeesTracked;
        _totalUBI = totalUBITracked;
        _totalTx = totalTxTracked;
        _protocolCount = protocolCount;
        _activeProtocols = _activeCount();
        _splitterFees = feeSplitter.totalFeesCollected();
        _splitterUBI = feeSplitter.totalUBIFunded();
        _snapshotCount = snapshotCount;
    }

    // ============ Admin ============

    function setProtocolActive(uint256 id, bool active) external onlyAdmin {
        require(id < protocolCount, "Invalid protocol");
        protocols[id].active = active;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "zero address");
        admin = newAdmin;
    }

    function setFeeSplitter(address _feeSplitter) external onlyAdmin {
        require(_feeSplitter != address(0), "zero address");
        feeSplitter = IUBIFeeSplitterStats(_feeSplitter);
    }

    // ============ Internal ============

    function _activeCount() internal view returns (uint256 count) {
        for (uint256 i = 0; i < protocolCount; i++) {
            if (protocols[i].active) count++;
        }
    }
}
