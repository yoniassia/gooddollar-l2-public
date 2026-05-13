// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LiFiBridgeAggregator
 * @notice Cross-chain swap aggregator for GoodSwap. Accepts user swap requests,
 *         routes to Li.Fi/1inch for cross-chain execution, and handles callbacks.
 *
 * @dev Flow:
 *   1. User calls initiateSwap() with source token + amount + dest chain/token
 *   2. Contract escrows source tokens and emits SwapRequested
 *   3. Backend keeper picks up event, executes via Li.Fi SDK
 *   4. Keeper calls completeSwap() to release funds or refundSwap() on failure
 *
 *   UBI Integration: 0.1% of swap value → UBIFeeSplitter
 *
 *   Supported routes:
 *     - Same-chain swaps (routed to GoodPool AMMs or external DEX aggregators)
 *     - Cross-chain swaps (routed via Li.Fi bridge aggregator)
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract LiFiBridgeAggregator {

    // ============ Types ============

    enum SwapStatus { Pending, Completed, Refunded, Expired }

    struct SwapRequest {
        address user;
        address srcToken;
        uint256 srcAmount;
        uint256 destChainId;
        address destToken;
        address destReceiver;
        uint256 minDestAmount;    // slippage protection
        uint256 deadline;         // block.timestamp deadline
        SwapStatus status;
        bytes32 lifiTxHash;       // Li.Fi tracking hash (set by keeper)
    }

    // ============ State ============

    address public admin;
    mapping(address => bool) public keepers;
    address public ubiFeeSplitter;

    uint256 public ubiFeeRateBps = 10;    // 0.1%
    uint256 public constant BPS = 10_000;
    uint256 public swapCount;

    mapping(uint256 => SwapRequest) public swaps;
    mapping(address => uint256[]) public userSwaps;

    // Supported destination chains
    mapping(uint256 => bool) public supportedChains;
    // Whitelisted tokens for cross-chain
    mapping(address => bool) public whitelistedTokens;

    // ============ Events ============

    event SwapRequested(
        uint256 indexed swapId,
        address indexed user,
        address srcToken,
        uint256 srcAmount,
        uint256 destChainId,
        address destToken,
        address destReceiver,
        uint256 minDestAmount,
        uint256 deadline
    );

    event SwapCompleted(
        uint256 indexed swapId,
        bytes32 lifiTxHash,
        uint256 destAmount
    );

    event SwapRefunded(uint256 indexed swapId, string reason);
    event SwapExpired(uint256 indexed swapId);
    event UBIFeeCollected(uint256 indexed swapId, address token, uint256 amount);

    // ============ Errors ============

    error NotAdmin();
    error NotKeeper();
    error InvalidSwapId();
    error SwapNotPending();
    error SwapNotExpired();
    error UnsupportedChain(uint256 chainId);
    error TokenNotWhitelisted(address token);
    error DeadlinePassed();
    error ZeroAmount();
    error TransferFailed();
    error SlippageExceeded(uint256 got, uint256 min);

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyKeeper() {
        if (!keepers[msg.sender] && msg.sender != admin) revert NotKeeper();
        _;
    }

    // ============ Constructor ============

    constructor(address _admin, address _ubiFeeSplitter) {
        admin = _admin;
        ubiFeeSplitter = _ubiFeeSplitter;
        keepers[_admin] = true;

        // Default supported chains
        supportedChains[1] = true;       // Ethereum mainnet
        supportedChains[10] = true;      // Optimism
        supportedChains[137] = true;     // Polygon
        supportedChains[42161] = true;   // Arbitrum
        supportedChains[8453] = true;    // Base
        supportedChains[42069] = true;   // GoodDollar L2 (local)
    }

    // ============ Admin ============

    function setKeeper(address keeper, bool authorized) external onlyAdmin {
        keepers[keeper] = authorized;
    }

    function setSupportedChain(uint256 chainId, bool supported) external onlyAdmin {
        supportedChains[chainId] = supported;
    }

    function setWhitelistedToken(address token, bool whitelisted) external onlyAdmin {
        whitelistedTokens[token] = whitelisted;
    }

    function setUBIFeeRate(uint256 bps) external onlyAdmin {
        require(bps <= 100, "Max 1%");
        ubiFeeRateBps = bps;
    }

    function setUBIFeeSplitter(address _splitter) external onlyAdmin {
        ubiFeeSplitter = _splitter;
    }

    // Batch whitelist tokens
    function batchWhitelistTokens(address[] calldata tokens) external onlyAdmin {
        for (uint256 i = 0; i < tokens.length; i++) {
            whitelistedTokens[tokens[i]] = true;
        }
    }

    // ============ User: Initiate Swap ============

    /**
     * @notice Initiate a cross-chain swap. User must approve srcToken first.
     * @param srcToken Source token address on this chain
     * @param srcAmount Amount of source token
     * @param destChainId Destination chain ID
     * @param destToken Destination token address on dest chain
     * @param destReceiver Address to receive tokens on dest chain
     * @param minDestAmount Minimum acceptable output (slippage protection)
     * @param deadline Timestamp deadline for swap execution
     * @return swapId Unique swap identifier
     */
    function initiateSwap(
        address srcToken,
        uint256 srcAmount,
        uint256 destChainId,
        address destToken,
        address destReceiver,
        uint256 minDestAmount,
        uint256 deadline
    ) external returns (uint256 swapId) {
        if (srcAmount == 0) revert ZeroAmount();
        if (!supportedChains[destChainId]) revert UnsupportedChain(destChainId);
        if (!whitelistedTokens[srcToken]) revert TokenNotWhitelisted(srcToken);
        if (block.timestamp > deadline) revert DeadlinePassed();

        // Collect UBI fee
        uint256 fee = (srcAmount * ubiFeeRateBps) / BPS;
        uint256 netAmount = srcAmount - fee;

        // Transfer source tokens to this contract
        if (!IERC20(srcToken).transferFrom(msg.sender, address(this), srcAmount)) {
            revert TransferFailed();
        }

        // Send UBI fee
        if (fee > 0 && ubiFeeSplitter != address(0)) {
            if (!IERC20(srcToken).transfer(ubiFeeSplitter, fee)) revert TransferFailed();
        }

        swapId = swapCount++;
        swaps[swapId] = SwapRequest({
            user: msg.sender,
            srcToken: srcToken,
            srcAmount: netAmount,
            destChainId: destChainId,
            destToken: destToken,
            destReceiver: destReceiver,
            minDestAmount: minDestAmount,
            deadline: deadline,
            status: SwapStatus.Pending,
            lifiTxHash: bytes32(0)
        });

        userSwaps[msg.sender].push(swapId);

        emit SwapRequested(
            swapId, msg.sender, srcToken, netAmount,
            destChainId, destToken, destReceiver, minDestAmount, deadline
        );
        emit UBIFeeCollected(swapId, srcToken, fee);
    }

    /**
     * @notice Initiate swap with native ETH.
     */
    function initiateSwapETH(
        uint256 destChainId,
        address destToken,
        address destReceiver,
        uint256 minDestAmount,
        uint256 deadline
    ) external payable returns (uint256 swapId) {
        if (msg.value == 0) revert ZeroAmount();
        if (!supportedChains[destChainId]) revert UnsupportedChain(destChainId);
        if (block.timestamp > deadline) revert DeadlinePassed();

        uint256 fee = (msg.value * ubiFeeRateBps) / BPS;
        uint256 netAmount = msg.value - fee;

        // Send UBI fee
        if (fee > 0 && ubiFeeSplitter != address(0)) {
            (bool sent,) = ubiFeeSplitter.call{value: fee}("");
            require(sent, "ETH fee transfer failed");
        }

        swapId = swapCount++;
        swaps[swapId] = SwapRequest({
            user: msg.sender,
            srcToken: address(0), // native ETH
            srcAmount: netAmount,
            destChainId: destChainId,
            destToken: destToken,
            destReceiver: destReceiver,
            minDestAmount: minDestAmount,
            deadline: deadline,
            status: SwapStatus.Pending,
            lifiTxHash: bytes32(0)
        });

        userSwaps[msg.sender].push(swapId);

        emit SwapRequested(
            swapId, msg.sender, address(0), netAmount,
            destChainId, destToken, destReceiver, minDestAmount, deadline
        );
        emit UBIFeeCollected(swapId, address(0), fee);
    }

    // ============ Keeper: Complete / Refund ============

    /**
     * @notice Mark swap as completed after Li.Fi execution.
     */
    function completeSwap(
        uint256 swapId,
        bytes32 lifiTxHash,
        uint256 destAmount
    ) external onlyKeeper {
        SwapRequest storage s = swaps[swapId];
        if (s.user == address(0)) revert InvalidSwapId();
        if (s.status != SwapStatus.Pending) revert SwapNotPending();
        if (destAmount < s.minDestAmount) revert SlippageExceeded(destAmount, s.minDestAmount);

        s.status = SwapStatus.Completed;
        s.lifiTxHash = lifiTxHash;

        emit SwapCompleted(swapId, lifiTxHash, destAmount);
    }

    /**
     * @notice Refund a failed swap. Returns escrowed tokens to user.
     */
    function refundSwap(uint256 swapId, string calldata reason) external onlyKeeper {
        SwapRequest storage s = swaps[swapId];
        if (s.user == address(0)) revert InvalidSwapId();
        if (s.status != SwapStatus.Pending) revert SwapNotPending();

        s.status = SwapStatus.Refunded;

        // Return escrowed tokens
        if (s.srcToken == address(0)) {
            (bool sent,) = s.user.call{value: s.srcAmount}("");
            require(sent, "ETH refund failed");
        } else {
            if (!IERC20(s.srcToken).transfer(s.user, s.srcAmount)) revert TransferFailed();
        }

        emit SwapRefunded(swapId, reason);
    }

    /**
     * @notice Anyone can expire a swap past its deadline.
     */
    function expireSwap(uint256 swapId) external {
        SwapRequest storage s = swaps[swapId];
        if (s.user == address(0)) revert InvalidSwapId();
        if (s.status != SwapStatus.Pending) revert SwapNotPending();
        if (block.timestamp <= s.deadline) revert SwapNotExpired();

        s.status = SwapStatus.Expired;

        // Auto-refund expired swaps
        if (s.srcToken == address(0)) {
            (bool sent,) = s.user.call{value: s.srcAmount}("");
            require(sent, "ETH refund failed");
        } else {
            if (!IERC20(s.srcToken).transfer(s.user, s.srcAmount)) revert TransferFailed();
        }

        emit SwapExpired(swapId);
    }

    // ============ View ============

    function getUserSwaps(address user) external view returns (uint256[] memory) {
        return userSwaps[user];
    }

    function getSwap(uint256 swapId) external view returns (SwapRequest memory) {
        return swaps[swapId];
    }

    // Accept ETH
    receive() external payable {}
}
