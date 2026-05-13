// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MultiChainBridge
 * @notice Unified multi-chain bridge router for GoodDollar L2.
 *         Routes deposits/withdrawals through:
 *           1. Native OP Stack bridge (GoodDollarBridgeL1/L2) for L1⇄L2
 *           2. Li.Fi aggregator for cross-chain (Arbitrum, Optimism, Polygon, Base, etc.)
 *           3. FastWithdrawalLP for instant L2→L1 withdrawals
 *
 *         33% of routing fees → UBI pool (GoodDollar principle).
 *
 * @dev The contract acts as a unified entry point. Users call bridgeTokens()
 *      with a destination chain ID, and the router picks the optimal path:
 *        - destChain == L1_CHAIN_ID → native OP Stack bridge
 *        - destChain == L2_CHAIN_ID → no-op (already on L2)
 *        - destChain == any other   → Li.Fi cross-chain aggregator
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface ILiFiBridgeAggregator {
    function initiateSwap(
        address srcToken,
        uint256 srcAmount,
        uint256 destChainId,
        address destToken,
        address destReceiver,
        uint256 minDestAmount,
        uint256 deadline
    ) external returns (uint256 swapId);

    function initiateSwapETH(
        uint256 destChainId,
        address destToken,
        address destReceiver,
        uint256 minDestAmount,
        uint256 deadline
    ) external payable returns (uint256 swapId);
}

interface IGoodDollarBridgeL2 {
    function initiateWithdrawal(address token, address to, uint256 amount) external;
    function initiateETHWithdrawal(address to) external payable;
}

interface IFastWithdrawalLP {
    function claimFastWithdrawal(
        address token,
        uint256 amount,
        address to,
        bytes32 withdrawalHash
    ) external;
}

contract MultiChainBridge {
    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 public constant L1_CHAIN_ID = 1;          // Ethereum mainnet
    uint256 public constant L2_CHAIN_ID = 42069;      // GoodDollar L2
    uint256 public constant BPS = 10_000;

    // ─── State ────────────────────────────────────────────────────────────────

    address public admin;
    address public ubiPool;

    /// @notice Routing fee in basis points (default 5 = 0.05%)
    uint256 public routingFeeBps;

    /// @notice UBI share of routing fee (3333 = 33.33%)
    uint256 public constant UBI_FEE_SHARE = 3333;

    ILiFiBridgeAggregator public lifiAggregator;
    IGoodDollarBridgeL2 public nativeBridge;
    IFastWithdrawalLP public fastWithdrawalLP;

    /// @notice Supported destination chains (beyond L1 native bridge)
    mapping(uint256 => bool) public supportedChains;

    /// @notice Token mapping: L2 token → destination chain → destination token address
    mapping(address => mapping(uint256 => address)) public tokenMappings;

    /// @notice Bridge request tracking
    uint256 public requestCount;

    enum RouteType { NativeBridge, LiFiCrossChain, FastWithdrawal }

    struct BridgeRequest {
        address user;
        address srcToken;       // address(0) for native ETH
        uint256 amount;
        uint256 destChainId;
        address destToken;
        address destReceiver;
        RouteType routeType;
        uint256 timestamp;
        bool completed;
    }

    mapping(uint256 => BridgeRequest) public requests;
    mapping(address => uint256[]) public userRequests;

    // ─── Events ───────────────────────────────────────────────────────────────

    event BridgeInitiated(
        uint256 indexed requestId,
        address indexed user,
        address srcToken,
        uint256 amount,
        uint256 destChainId,
        address destToken,
        RouteType routeType
    );

    event BridgeCompleted(uint256 indexed requestId);
    event RoutingFeeCollected(address token, uint256 totalFee, uint256 ubiShare);
    event ChainSupportUpdated(uint256 chainId, bool supported);
    event TokenMappingUpdated(address l2Token, uint256 destChainId, address destToken);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotAdmin();
    error UnsupportedChain(uint256 chainId);
    error ZeroAmount();
    error ZeroAddress();
    error TransferFailed();
    error AlreadyOnL2();
    error NoTokenMapping(address token, uint256 chainId);
    error InsufficientValue();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address _admin,
        address _ubiPool,
        address _lifiAggregator,
        address _nativeBridge,
        address _fastWithdrawalLP
    ) {
        admin = _admin;
        ubiPool = _ubiPool;
        lifiAggregator = ILiFiBridgeAggregator(_lifiAggregator);
        nativeBridge = IGoodDollarBridgeL2(_nativeBridge);
        fastWithdrawalLP = IFastWithdrawalLP(_fastWithdrawalLP);
        routingFeeBps = 5; // 0.05%

        // Default supported chains
        supportedChains[1] = true;       // Ethereum
        supportedChains[10] = true;      // Optimism
        supportedChains[137] = true;     // Polygon
        supportedChains[42161] = true;   // Arbitrum
        supportedChains[8453] = true;    // Base
        supportedChains[56] = true;      // BNB Chain
        supportedChains[43114] = true;   // Avalanche
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setRoutingFeeBps(uint256 bps) external onlyAdmin {
        require(bps <= 100, "Max 1%");
        routingFeeBps = bps;
    }

    function setSupportedChain(uint256 chainId, bool supported) external onlyAdmin {
        supportedChains[chainId] = supported;
        emit ChainSupportUpdated(chainId, supported);
    }

    function setTokenMapping(address l2Token, uint256 destChainId, address destToken) external onlyAdmin {
        tokenMappings[l2Token][destChainId] = destToken;
        emit TokenMappingUpdated(l2Token, destChainId, destToken);
    }

    function batchSetTokenMappings(
        address[] calldata l2Tokens,
        uint256[] calldata chainIds,
        address[] calldata destTokens
    ) external onlyAdmin {
        require(l2Tokens.length == chainIds.length && chainIds.length == destTokens.length, "Length mismatch");
        for (uint256 i = 0; i < l2Tokens.length; i++) {
            tokenMappings[l2Tokens[i]][chainIds[i]] = destTokens[i];
            emit TokenMappingUpdated(l2Tokens[i], chainIds[i], destTokens[i]);
        }
    }

    function setLiFiAggregator(address _agg) external onlyAdmin {
        lifiAggregator = ILiFiBridgeAggregator(_agg);
    }

    function setNativeBridge(address _bridge) external onlyAdmin {
        nativeBridge = IGoodDollarBridgeL2(_bridge);
    }

    function setFastWithdrawalLP(address _lp) external onlyAdmin {
        fastWithdrawalLP = IFastWithdrawalLP(_lp);
    }

    function setUBIPool(address _pool) external onlyAdmin {
        ubiPool = _pool;
    }

    // ─── Bridge ERC20 tokens ──────────────────────────────────────────────────

    /**
     * @notice Bridge ERC20 tokens to another chain.
     * @param token      Source token on GoodDollar L2
     * @param amount     Amount to bridge
     * @param destChainId Destination chain ID
     * @param receiver   Receiver address on destination chain
     * @param minOutput  Minimum acceptable output (slippage protection)
     * @param deadline   Timestamp deadline
     * @param useFastWithdrawal Use fast withdrawal LP for L1 withdrawals
     * @return requestId Bridge request identifier
     */
    function bridgeTokens(
        address token,
        uint256 amount,
        uint256 destChainId,
        address receiver,
        uint256 minOutput,
        uint256 deadline,
        bool useFastWithdrawal
    ) external returns (uint256 requestId) {
        if (amount == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();
        if (destChainId == L2_CHAIN_ID) revert AlreadyOnL2();
        if (!supportedChains[destChainId]) revert UnsupportedChain(destChainId);

        // Transfer tokens from user
        if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) {
            revert TransferFailed();
        }

        // Deduct routing fee
        uint256 fee = (amount * routingFeeBps) / BPS;
        uint256 netAmount = amount - fee;
        _distributeFee(token, fee);

        // Determine route
        RouteType routeType;
        if (destChainId == L1_CHAIN_ID && !useFastWithdrawal) {
            // Native OP Stack withdrawal
            routeType = RouteType.NativeBridge;
            IERC20(token).approve(address(nativeBridge), netAmount);
            nativeBridge.initiateWithdrawal(token, receiver, netAmount);
        } else if (destChainId == L1_CHAIN_ID && useFastWithdrawal) {
            // Fast withdrawal via LP
            routeType = RouteType.FastWithdrawal;
            // Tokens held by this contract — LP settlement happens async
            // Emit event for backend keeper to process fast withdrawal
        } else {
            // Cross-chain via Li.Fi
            routeType = RouteType.LiFiCrossChain;
            address destToken = tokenMappings[token][destChainId];
            if (destToken == address(0)) revert NoTokenMapping(token, destChainId);

            IERC20(token).approve(address(lifiAggregator), netAmount);
            lifiAggregator.initiateSwap(
                token,
                netAmount,
                destChainId,
                destToken,
                receiver,
                minOutput,
                deadline
            );
        }

        requestId = requestCount++;
        requests[requestId] = BridgeRequest({
            user: msg.sender,
            srcToken: token,
            amount: netAmount,
            destChainId: destChainId,
            destToken: destChainId == L1_CHAIN_ID ? token : tokenMappings[token][destChainId],
            destReceiver: receiver,
            routeType: routeType,
            timestamp: block.timestamp,
            completed: routeType == RouteType.NativeBridge || routeType == RouteType.LiFiCrossChain
        });

        userRequests[msg.sender].push(requestId);

        emit BridgeInitiated(
            requestId, msg.sender, token, netAmount,
            destChainId, requests[requestId].destToken, routeType
        );
    }

    /**
     * @notice Bridge native ETH to another chain.
     */
    function bridgeETH(
        uint256 destChainId,
        address receiver,
        uint256 minOutput,
        uint256 deadline,
        bool useFastWithdrawal
    ) external payable returns (uint256 requestId) {
        if (msg.value == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();
        if (destChainId == L2_CHAIN_ID) revert AlreadyOnL2();
        if (!supportedChains[destChainId]) revert UnsupportedChain(destChainId);

        uint256 fee = (msg.value * routingFeeBps) / BPS;
        uint256 netAmount = msg.value - fee;
        _distributeFeeETH(fee);

        RouteType routeType;
        if (destChainId == L1_CHAIN_ID && !useFastWithdrawal) {
            routeType = RouteType.NativeBridge;
            nativeBridge.initiateETHWithdrawal{value: netAmount}(receiver);
        } else if (destChainId == L1_CHAIN_ID && useFastWithdrawal) {
            routeType = RouteType.FastWithdrawal;
        } else {
            routeType = RouteType.LiFiCrossChain;
            lifiAggregator.initiateSwapETH{value: netAmount}(
                destChainId,
                address(0), // native ETH on dest
                receiver,
                minOutput,
                deadline
            );
        }

        requestId = requestCount++;
        requests[requestId] = BridgeRequest({
            user: msg.sender,
            srcToken: address(0),
            amount: netAmount,
            destChainId: destChainId,
            destToken: address(0),
            destReceiver: receiver,
            routeType: routeType,
            timestamp: block.timestamp,
            completed: routeType == RouteType.NativeBridge || routeType == RouteType.LiFiCrossChain
        });

        userRequests[msg.sender].push(requestId);

        emit BridgeInitiated(
            requestId, msg.sender, address(0), netAmount,
            destChainId, address(0), routeType
        );
    }

    // ─── Fee distribution ─────────────────────────────────────────────────────

    function _distributeFee(address token, uint256 fee) internal {
        if (fee == 0 || ubiPool == address(0)) return;
        uint256 ubiShare = (fee * UBI_FEE_SHARE) / BPS;
        uint256 protocolShare = fee - ubiShare;

        if (ubiShare > 0) {
            if (!IERC20(token).transfer(ubiPool, ubiShare)) revert TransferFailed();
        }
        // Protocol share stays in contract (admin can withdraw)
        emit RoutingFeeCollected(token, fee, ubiShare);
    }

    function _distributeFeeETH(uint256 fee) internal {
        if (fee == 0 || ubiPool == address(0)) return;
        uint256 ubiShare = (fee * UBI_FEE_SHARE) / BPS;
        if (ubiShare > 0) {
            (bool sent,) = ubiPool.call{value: ubiShare}("");
            require(sent, "UBI ETH transfer failed");
        }
        emit RoutingFeeCollected(address(0), fee, ubiShare);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function getUserRequests(address user) external view returns (uint256[] memory) {
        return userRequests[user];
    }

    function getRequest(uint256 requestId) external view returns (BridgeRequest memory) {
        return requests[requestId];
    }

    /**
     * @notice Determine the optimal route for a given destination chain.
     * @return routeType The route that would be used
     * @return description Human-readable description
     */
    function getRouteInfo(uint256 destChainId, bool useFastWithdrawal)
        external
        pure
        returns (RouteType routeType, string memory description)
    {
        if (destChainId == L2_CHAIN_ID) {
            return (RouteType.NativeBridge, "Already on GoodDollar L2");
        }
        if (destChainId == L1_CHAIN_ID) {
            if (useFastWithdrawal) {
                return (RouteType.FastWithdrawal, "Fast withdrawal via LP (instant, 0.3% fee)");
            }
            return (RouteType.NativeBridge, "OP Stack native bridge (7-day challenge period)");
        }
        return (RouteType.LiFiCrossChain, "Cross-chain via Li.Fi aggregator");
    }

    /// @notice Admin can withdraw accumulated protocol fees
    function withdrawProtocolFees(address token, uint256 amount, address to) external onlyAdmin {
        if (token == address(0)) {
            (bool sent,) = to.call{value: amount}("");
            require(sent, "ETH withdraw failed");
        } else {
            if (!IERC20(token).transfer(to, amount)) revert TransferFailed();
        }
    }

    receive() external payable {}
}
