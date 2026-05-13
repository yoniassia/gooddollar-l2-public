// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GoodDollar Bridge L2
 * @notice Handles deposit finalization and withdrawal initiation on GoodDollar L2.
 *         Mints bridged tokens on deposit, burns on withdrawal.
 * @dev L2 side of the OP Stack bridge. Cross-domain messages relayed by L2 messenger.
 */

interface IERC20Mintable {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

interface IL2CrossDomainMessenger {
    function sendMessage(address target, bytes calldata message, uint32 gasLimit) external;
    function xDomainMessageSender() external view returns (address);
}

contract GoodDollarBridgeL2 {
    IL2CrossDomainMessenger public immutable messenger;
    address public l1Bridge;
    address public admin;

    // Bridged token representations on L2
    mapping(address => address) public l1ToL2Token;
    mapping(address => uint256) public totalMinted;

    bool public paused;
    bool private _locked;

    /// @notice Total ETH currently locked in this contract for pending L2->L1 withdrawals.
    ///         This ETH must NOT be used to fund finalizeETHDeposit payouts.
    uint256 public pendingETHWithdrawalTotal;

    event DepositFinalized(
        address indexed l1Token,
        address indexed l2Token,
        address indexed to,
        uint256 amount
    );
    event WithdrawalInitiated(
        address indexed l1Token,
        address indexed from,
        address indexed to,
        uint256 amount
    );
    event ETHDepositFinalized(address indexed to, uint256 amount);
    event ETHWithdrawalInitiated(address indexed from, address indexed to, uint256 amount);

    error ZeroAmount();
    error ZeroAddress();
    error BridgePaused();
    error NotMessenger();
    error NotL1Bridge();
    error NotAdmin();
    error TokenNotMapped();
    error TransferFailed();
    error InsufficientETH();
    error PeerNotConfigured();
    error InsufficientFreeETH();
    error Reentrant();

    modifier nonReentrant() {
        if (_locked) revert Reentrant();
        _locked = true;
        _;
        _locked = false;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert BridgePaused();
        _;
    }

    modifier onlyFromL1Bridge() {
        if (msg.sender != address(messenger)) revert NotMessenger();
        if (messenger.xDomainMessageSender() != l1Bridge) revert NotL1Bridge();
        _;
    }

    /// @dev Guard against withdrawals before setL1Bridge() is called -- would burn
    ///      L2 tokens permanently since the cross-domain message targets address(0).
    modifier peerConfigured() {
        if (l1Bridge == address(0)) revert PeerNotConfigured();
        _;
    }

    constructor(
        address _messenger,
        address _admin
    ) {
        if (_messenger == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();

        messenger = IL2CrossDomainMessenger(_messenger);
        admin = _admin;
    }

    function setL1Bridge(address _l1Bridge) external onlyAdmin {
        if (_l1Bridge == address(0)) revert ZeroAddress();
        l1Bridge = _l1Bridge;
    }

    function mapToken(address l1Token, address l2Token) external onlyAdmin {
        if (l1Token == address(0) || l2Token == address(0)) revert ZeroAddress();
        l1ToL2Token[l1Token] = l2Token;
    }

    // ============ Deposit Finalization (L1 -> L2) ============
    // Called by L2CrossDomainMessenger when L1 deposit message is relayed

    function finalizeDeposit(
        address l1Token,
        address, /* from */
        address to,
        uint256 amount
    ) external onlyFromL1Bridge {
        address l2Token = l1ToL2Token[l1Token];
        if (l2Token == address(0)) revert TokenNotMapped();

        IERC20Mintable(l2Token).mint(to, amount);
        totalMinted[l1Token] += amount;

        emit DepositFinalized(l1Token, l2Token, to, amount);
    }

    /// @notice Finalize an ETH deposit from L1.
    /// @dev Only uses ETH that is NOT reserved for pending L2->L1 withdrawals.
    ///      Reentrancy guard prevents malicious `to` contracts from re-entering.
    function finalizeETHDeposit(
        address, /* from */
        address to,
        uint256 amount
    ) external onlyFromL1Bridge nonReentrant {
        // Only spend ETH that is not reserved for pending withdrawals.
        // This separates the two ETH pools and prevents theft of withdrawal-locked ETH.
        uint256 freeETH = address(this).balance - pendingETHWithdrawalTotal;
        if (freeETH < amount) revert InsufficientFreeETH();

        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit ETHDepositFinalized(to, amount);
    }

    // ============ Withdrawals (L2 -> L1) ============
    // User initiates on L2, finalized on L1 after 7-day challenge

    function withdrawGDollar(address l1Token, address to, uint256 amount) external whenNotPaused peerConfigured {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();

        address l2Token = l1ToL2Token[l1Token];
        if (l2Token == address(0)) revert TokenNotMapped();

        IERC20Mintable(l2Token).burn(msg.sender, amount);
        totalMinted[l1Token] -= amount;

        bytes memory message = abi.encodeCall(
            IGoodDollarBridgeL1.finalizeGDollarWithdrawal,
            (to, amount)
        );
        messenger.sendMessage(l1Bridge, message, 200_000);

        emit WithdrawalInitiated(l1Token, msg.sender, to, amount);
    }

    function withdrawUSDC(address l1Token, address to, uint256 amount) external whenNotPaused peerConfigured {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();

        address l2Token = l1ToL2Token[l1Token];
        if (l2Token == address(0)) revert TokenNotMapped();

        IERC20Mintable(l2Token).burn(msg.sender, amount);
        totalMinted[l1Token] -= amount;

        bytes memory message = abi.encodeCall(
            IGoodDollarBridgeL1.finalizeUSDCWithdrawal,
            (to, amount)
        );
        messenger.sendMessage(l1Bridge, message, 200_000);

        emit WithdrawalInitiated(l1Token, msg.sender, to, amount);
    }

    /// @notice Initiate an ETH withdrawal from L2 to L1.
    /// @dev The caller must send exactly `amount` ETH. The ETH is locked in this contract
    ///      and tracked in `pendingETHWithdrawalTotal` to prevent it from being consumed
    ///      by finalizeETHDeposit. A cross-domain message is queued to release the
    ///      corresponding ETH on L1 after the 7-day challenge window.
    ///      Reentrancy guard is included as defense-in-depth.
    function withdrawETH(address to, uint256 amount) external payable nonReentrant whenNotPaused peerConfigured {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        if (msg.value != amount) revert InsufficientETH();

        // Reserve the incoming ETH so it cannot be spent by finalizeETHDeposit.
        pendingETHWithdrawalTotal += amount;

        bytes memory message = abi.encodeCall(
            IGoodDollarBridgeL1.finalizeETHWithdrawal,
            (to, amount)
        );
        messenger.sendMessage(l1Bridge, message, 200_000);

        emit ETHWithdrawalInitiated(msg.sender, to, amount);
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

interface IGoodDollarBridgeL1 {
    function finalizeGDollarWithdrawal(address to, uint256 amount) external;
    function finalizeUSDCWithdrawal(address to, uint256 amount) external;
    function finalizeETHWithdrawal(address to, uint256 amount) external;
}
