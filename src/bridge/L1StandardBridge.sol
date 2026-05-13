// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title L1StandardBridge
 * @notice Bridges ETH and ERC20 tokens between L1 and L2.
 *         GoodDollar adaptation: UBI fee on bridge deposits.
 */
interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract L1StandardBridge {

    /// @notice Portal address for deposit transactions
    address public portal;

    /// @notice Owner / admin
    address public owner;

    /// @notice UBI fee in basis points
    uint256 public ubiFee = 33; // 0.33%

    /// @notice UBI treasury
    address public ubiTreasury;

    /// @notice Mapping of L1 token → L2 token addresses
    mapping(address => address) public tokenPairs;

    /// @notice Deposit tracking
    mapping(address => mapping(address => uint256)) public deposits;

    event ETHBridgeInitiated(address indexed from, address indexed to, uint256 amount, bytes extraData);
    event ETHBridgeFinalized(address indexed from, address indexed to, uint256 amount, bytes extraData);
    event ERC20BridgeInitiated(address indexed l1Token, address indexed l2Token, address indexed from, address to, uint256 amount, bytes extraData);
    event ERC20BridgeFinalized(address indexed l1Token, address indexed l2Token, address indexed from, address to, uint256 amount, bytes extraData);

    constructor() {
        owner = msg.sender;
        ubiTreasury = msg.sender;
    }

    /// @notice Initialize with portal
    function initialize(address _portal) external {
        require(portal == address(0), "already initialized");
        portal = _portal;
    }

    /// @notice Bridge ETH from L1 to L2
    function bridgeETH(uint32 /*_minGasLimit*/, bytes calldata _extraData) external payable {
        require(msg.value > 0, "must send ETH");

        uint256 fee = (msg.value * ubiFee) / 10000;
        uint256 bridgeAmount = msg.value - fee;

        // Send UBI fee
        if (fee > 0 && ubiTreasury != address(0)) {
            (bool ok,) = ubiTreasury.call{value: fee}("");
            require(ok, "UBI fee failed");
        }

        emit ETHBridgeInitiated(msg.sender, msg.sender, bridgeAmount, _extraData);
    }

    /// @notice Bridge ETH to specific address on L2
    function bridgeETHTo(address _to, uint32 /*_minGasLimit*/, bytes calldata _extraData) external payable {
        require(msg.value > 0, "must send ETH");

        uint256 fee = (msg.value * ubiFee) / 10000;
        uint256 bridgeAmount = msg.value - fee;

        if (fee > 0 && ubiTreasury != address(0)) {
            (bool ok,) = ubiTreasury.call{value: fee}("");
            require(ok, "UBI fee failed");
        }

        emit ETHBridgeInitiated(msg.sender, _to, bridgeAmount, _extraData);
    }

    /// @notice Bridge ERC20 from L1 to L2
    function bridgeERC20(
        address _l1Token,
        address _l2Token,
        uint256 _amount,
        uint32 /*_minGasLimit*/,
        bytes calldata _extraData
    ) external {
        require(IERC20Minimal(_l1Token).transferFrom(msg.sender, address(this), _amount), "transfer failed");
        deposits[_l1Token][msg.sender] += _amount;

        emit ERC20BridgeInitiated(_l1Token, _l2Token, msg.sender, msg.sender, _amount, _extraData);
    }

    /// @notice Finalize ETH withdrawal from L2 (called by portal)
    function finalizeETHWithdrawal(
        address _from,
        address payable _to,
        uint256 _amount,
        bytes calldata _extraData
    ) external {
        // In production, only callable by portal after proof verification
        (bool ok,) = _to.call{value: _amount}("");
        require(ok, "ETH transfer failed");

        emit ETHBridgeFinalized(_from, _to, _amount, _extraData);
    }

    /// @notice Finalize ERC20 withdrawal from L2
    function finalizeERC20Withdrawal(
        address _l1Token,
        address _l2Token,
        address _from,
        address _to,
        uint256 _amount,
        bytes calldata _extraData
    ) external {
        deposits[_l1Token][_from] -= _amount;
        require(IERC20Minimal(_l1Token).transfer(_to, _amount), "transfer failed");

        emit ERC20BridgeFinalized(_l1Token, _l2Token, _from, _to, _amount, _extraData);
    }

    /// @notice Set token pair mapping
    function setTokenPair(address _l1Token, address _l2Token) external {
        require(msg.sender == owner, "only owner");
        tokenPairs[_l1Token] = _l2Token;
    }

    /// @notice Set UBI fee
    function setUBIFee(uint256 _fee) external {
        require(msg.sender == owner, "only owner");
        require(_fee <= 1000, "max 10%");
        ubiFee = _fee;
    }

    /// @notice Accept ETH
    receive() external payable {}
}
