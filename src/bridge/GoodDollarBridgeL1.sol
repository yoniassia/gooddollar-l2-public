// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GoodDollar Bridge L1
 * @notice Locks G$, ETH, and USDC on Ethereum L1 for bridging to GoodDollar L2.
 *         Uses the OP Stack cross-domain messaging pattern.
 * @dev L1 side: lock tokens on deposit, unlock on finalized withdrawal.
 *      Cross-domain messages are relayed via IL1CrossDomainMessenger.
 */

interface IBridgeToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IL1CrossDomainMessenger {
    function sendMessage(address target, bytes calldata message, uint32 gasLimit) external;
    function xDomainMessageSender() external view returns (address);
}

contract GoodDollarBridgeL1 {
    IL1CrossDomainMessenger public immutable messenger;
    address public l2Bridge;
    address public admin;

    IBridgeToken public immutable goodDollar;
    IBridgeToken public immutable usdc;

    mapping(address => mapping(address => uint256)) public deposits;
    uint256 public totalGDollarLocked;
    uint256 public totalUSDCLocked;
    uint256 public totalETHLocked;

    bool public paused;

    event DepositInitiated(
        address indexed token,
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes32 depositHash
    );
    event WithdrawalFinalized(
        address indexed token,
        address indexed to,
        uint256 amount,
        bytes32 withdrawalHash
    );
    event ETHDepositInitiated(address indexed from, address indexed to, uint256 amount);
    event ETHWithdrawalFinalized(address indexed to, uint256 amount);

    error ZeroAmount();
    error ZeroAddress();
    error BridgePaused();
    error NotMessenger();
    error NotL2Bridge();
    error NotAdmin();
    error TransferFailed();
    error InsufficientETH();
    error PeerNotConfigured();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert BridgePaused();
        _;
    }

    modifier onlyFromL2Bridge() {
        if (msg.sender != address(messenger)) revert NotMessenger();
        if (messenger.xDomainMessageSender() != l2Bridge) revert NotL2Bridge();
        _;
    }

    /// @dev Guard against deposits before setL2Bridge() is called — would lock
    ///      funds permanently since the cross-domain message targets address(0).
    modifier peerConfigured() {
        if (l2Bridge == address(0)) revert PeerNotConfigured();
        _;
    }

    constructor(
        address _messenger,
        address _goodDollar,
        address _usdc,
        address _admin
    ) {
        if (_messenger == address(0)) revert ZeroAddress();
        if (_goodDollar == address(0)) revert ZeroAddress();
        if (_usdc == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();

        messenger = IL1CrossDomainMessenger(_messenger);
        goodDollar = IBridgeToken(_goodDollar);
        usdc = IBridgeToken(_usdc);
        admin = _admin;
    }

    function setL2Bridge(address _l2Bridge) external onlyAdmin {
        if (_l2Bridge == address(0)) revert ZeroAddress();
        l2Bridge = _l2Bridge;
    }

    // ============ Deposits (L1 → L2) ============

    function depositGDollar(address to, uint256 amount) external whenNotPaused peerConfigured {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();

        bool success = goodDollar.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        deposits[address(goodDollar)][msg.sender] += amount;
        totalGDollarLocked += amount;

        bytes memory message = abi.encodeCall(
            IGoodDollarBridgeL2.finalizeDeposit,
            (address(goodDollar), msg.sender, to, amount)
        );
        messenger.sendMessage(l2Bridge, message, 200_000);

        bytes32 depositHash = keccak256(abi.encodePacked(address(goodDollar), msg.sender, to, amount, block.number));
        emit DepositInitiated(address(goodDollar), msg.sender, to, amount, depositHash);
    }

    function depositUSDC(address to, uint256 amount) external whenNotPaused peerConfigured {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();

        bool success = usdc.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        deposits[address(usdc)][msg.sender] += amount;
        totalUSDCLocked += amount;

        bytes memory message = abi.encodeCall(
            IGoodDollarBridgeL2.finalizeDeposit,
            (address(usdc), msg.sender, to, amount)
        );
        messenger.sendMessage(l2Bridge, message, 200_000);

        bytes32 depositHash = keccak256(abi.encodePacked(address(usdc), msg.sender, to, amount, block.number));
        emit DepositInitiated(address(usdc), msg.sender, to, amount, depositHash);
    }

    function depositETH(address to) external payable whenNotPaused peerConfigured {
        if (msg.value == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();

        totalETHLocked += msg.value;

        bytes memory message = abi.encodeCall(
            IGoodDollarBridgeL2.finalizeETHDeposit,
            (msg.sender, to, msg.value)
        );
        messenger.sendMessage(l2Bridge, message, 200_000);

        emit ETHDepositInitiated(msg.sender, to, msg.value);
    }

    // ============ Withdrawal Finalization (L2 → L1) ============
    // Called by L1CrossDomainMessenger after 7-day challenge period

    function finalizeGDollarWithdrawal(
        address to,
        uint256 amount
    ) external onlyFromL2Bridge {
        totalGDollarLocked -= amount;
        bool success = goodDollar.transfer(to, amount);
        if (!success) revert TransferFailed();

        bytes32 hash = keccak256(abi.encodePacked(address(goodDollar), to, amount, block.number));
        emit WithdrawalFinalized(address(goodDollar), to, amount, hash);
    }

    function finalizeUSDCWithdrawal(
        address to,
        uint256 amount
    ) external onlyFromL2Bridge {
        totalUSDCLocked -= amount;
        bool success = usdc.transfer(to, amount);
        if (!success) revert TransferFailed();

        bytes32 hash = keccak256(abi.encodePacked(address(usdc), to, amount, block.number));
        emit WithdrawalFinalized(address(usdc), to, amount, hash);
    }

    function finalizeETHWithdrawal(
        address to,
        uint256 amount
    ) external onlyFromL2Bridge {
        if (address(this).balance < amount) revert InsufficientETH();
        totalETHLocked -= amount;

        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit ETHWithdrawalFinalized(to, amount);
    }

    // ============ Admin ============

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
    }

    receive() external payable {}
}

interface IGoodDollarBridgeL2 {
    function finalizeDeposit(address token, address from, address to, uint256 amount) external;
    function finalizeETHDeposit(address from, address to, uint256 amount) external;
}
