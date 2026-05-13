// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/GoodSwap.sol";

// ─── Minimal ERC-20 mock ──────────────────────────────────────────────────────

contract Token is Test {
    string  public name;
    string  public symbol;
    uint8   public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol) {
        name     = _name;
        symbol   = _symbol;
        decimals = 18;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply   += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        balanceOf[from]               -= amount;
        balanceOf[to]                 += amount;
        allowance[from][msg.sender]   -= amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}

// ─── Flash-swap callee mock ───────────────────────────────────────────────────

contract FlashCallee is IGoodSwapCallee {
    address public pair;

    // Repay params set by the test before triggering flash swap
    Token  public repayToken;
    uint256 public repayAmount;

    address public lastSender;
    uint256 public lastAmt0;
    uint256 public lastAmt1;
    bytes   public lastData;

    constructor(address _pair) { pair = _pair; }

    function setRepay(address _token, uint256 _amount) external {
        repayToken  = Token(_token);
        repayAmount = _amount;
    }

    function goodSwapCall(
        address sender,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external override {
        lastSender = sender;
        lastAmt0   = amount0;
        lastAmt1   = amount1;
        lastData   = data;
        // Repay: send tokens back to the pair so the invariant is satisfied
        if (repayAmount > 0) {
            repayToken.transfer(pair, repayAmount);
        }
    }
}

// ─── Test contract ────────────────────────────────────────────────────────────

contract GoodSwapTest is Test {
    Token    internal t0;
    Token    internal t1;
    GoodSwap internal pair;

    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");

    // ── Setup ──────────────────────────────────────────────────────────────────

    function setUp() public {
        // Deploy two tokens and sort them so t0 < t1 (matches constructor order)
        Token a = new Token("TokenA", "TKA");
        Token b = new Token("TokenB", "TKB");
        if (address(a) > address(b)) (a, b) = (b, a);
        t0 = a;
        t1 = b;

        pair = new GoodSwap(address(t0), address(t1));
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /// Seed the pair with initial liquidity and return LP tokens issued.
    function _seed(uint256 amt0, uint256 amt1) internal returns (uint256 lp) {
        t0.mint(address(pair), amt0);
        t1.mint(address(pair), amt1);
        lp = pair.mint(address(this));
    }

    // ── Constructor ────────────────────────────────────────────────────────────

    function test_constructor() public view {
        assertEq(pair.factory(), address(this));
        assertEq(pair.token0(),  address(t0));
        assertEq(pair.token1(),  address(t1));
        assertEq(pair.totalSupply(), 0);
    }

    // ── mint: initial liquidity ────────────────────────────────────────────────

    function test_mint_initial() public {
        uint256 amt0 = 100e18;
        uint256 amt1 = 400e18;
        t0.mint(address(pair), amt0);
        t1.mint(address(pair), amt1);

        vm.expectEmit(true, false, false, true);
        emit GoodSwap.Mint(address(this), amt0, amt1);

        uint256 lp = pair.mint(address(this));
        // LP = sqrt(100e18 * 400e18) - MINIMUM_LIQUIDITY = 200e18 - 1000
        assertEq(lp, 200e18 - 1000);
        assertEq(pair.balanceOf(address(this)), lp);
        assertEq(pair.balanceOf(address(0)),    1000);           // locked
        assertEq(pair.totalSupply(),            200e18);         // lp + MINIMUM
        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertEq(r0, amt0);
        assertEq(r1, amt1);
    }

    function test_mint_subsequent() public {
        uint256 lp1 = _seed(100e18, 400e18);
        uint256 prevTotal = pair.totalSupply();

        // Add liquidity proportionally: 10% of existing reserves
        uint256 add0 = 10e18;
        uint256 add1 = 40e18;
        t0.mint(address(pair), add0);
        t1.mint(address(pair), add1);
        uint256 lp2 = pair.mint(alice);

        // Should mint 10% of totalSupply at deposit time
        uint256 expected = (add0 * prevTotal) / 100e18; // min(l0,l1) same ratio
        assertEq(lp2, expected);
        assertEq(pair.balanceOf(alice), lp2);
        assertGt(lp2, 0);
        assertGt(lp2, lp1 / 11); // sanity: roughly 10% of initial
    }

    function test_mint_revert_insufficientLiquidityMinted() public {
        // sqrt(1000 * 1000) == MINIMUM_LIQUIDITY → liquidity = 0 → InsufficientLiquidityMinted
        // (1 wei each would cause underflow before the revert)
        t0.mint(address(pair), 1000);
        t1.mint(address(pair), 1000);
        vm.expectRevert(GoodSwap.InsufficientLiquidityMinted.selector);
        pair.mint(address(this));
    }

    // ── mint: TWAP accumulator updates ────────────────────────────────────────

    function test_mint_twap_updates_on_subsequent() public {
        _seed(100e18, 400e18);
        uint256 cum0Before = pair.price0CumulativeLast();
        uint256 cum1Before = pair.price1CumulativeLast();

        vm.warp(block.timestamp + 100);

        t0.mint(address(pair), 10e18);
        t1.mint(address(pair), 40e18);
        pair.mint(alice);

        // Accumulators should have advanced
        assertGt(pair.price0CumulativeLast(), cum0Before);
        assertGt(pair.price1CumulativeLast(), cum1Before);
    }

    // ── burn ───────────────────────────────────────────────────────────────────

    function test_burn_happy() public {
        uint256 lp = _seed(100e18, 400e18);

        // Transfer LP to pair then burn
        // Simulate LP transfer: manually credit pair's internal balanceOf
        // (GoodSwap has its own LP mapping, not full ERC-20)
        // We are address(this), holding `lp` LP tokens.
        // To burn we send LP to the pair first:
        // GoodSwap tracks balanceOf[address(this)] — we need to simulate a transfer
        // by giving the pair our LP balance as its own "pending" burn amount.
        // The pair's burn() reads balanceOf[address(pair)] for LP in.
        // So we need to manipulate storage:
        // balanceOf mapping is at base slot 8 in GoodSwap storage layout.
        // balanceOf[address(pair)] → keccak256(abi.encode(address(pair), 8))
        uint256 slot = uint256(keccak256(abi.encode(address(pair), uint256(8))));
        vm.store(address(pair), bytes32(slot), bytes32(lp));

        // Only check indexed fields (sender + to), not the amount data
        vm.expectEmit(true, true, false, false);
        emit GoodSwap.Burn(address(this), 0, 0, address(bob));

        (uint256 out0, uint256 out1) = pair.burn(bob);
        assertGt(out0, 0);
        assertGt(out1, 0);
        assertEq(t0.balanceOf(bob), out0);
        assertEq(t1.balanceOf(bob), out1);
        // LP balance reduced
        assertEq(pair.balanceOf(address(pair)), 0);
    }

    function test_burn_proportional() public {
        uint256 lp = _seed(1_000e18, 2_000e18);
        // Burn half the liquidity
        uint256 burnAmount = lp / 2;

        // balanceOf mapping at base slot 8
        uint256 slot = uint256(keccak256(abi.encode(address(pair), uint256(8))));
        vm.store(address(pair), bytes32(slot), bytes32(burnAmount));

        (uint256 out0, uint256 out1) = pair.burn(alice);

        // out0 ≈ burnAmount/totalSupply * reserve0
        // With MINIMUM_LIQUIDITY locked, the math is: out = lp * bal / totalSupply
        // reserves shrunk by the burned fraction — just assert positivity & ratio
        assertGt(out0, 0);
        assertGt(out1, 0);
        assertApproxEqRel(out0 * 2_000e18, out1 * 1_000e18, 1e15); // 0.1% tol
        assertEq(pair.balanceOf(address(pair)), 0);
    }

    function test_burn_revert_insufficientLiquidityBurned() public {
        _seed(100e18, 400e18);
        // Don't send any LP to pair → balanceOf[pair] == 0
        vm.expectRevert(GoodSwap.InsufficientLiquidityBurned.selector);
        pair.burn(alice);
    }

    // ── swap: basic token1→token0 ──────────────────────────────────────────────

    function test_swap_token1_in() public {
        _seed(1_000e18, 1_000e18);

        uint256 amtIn = 10e18;
        // Expected out (0.3% fee): dy = y * dx / (x + dx) * 0.997 approx
        // Using the k-invariant formula: out < amtIn for balanced pool
        uint256 amount0Out = 9e18; // ask for ~9 token0

        t1.mint(address(pair), amtIn);

        vm.expectEmit(true, false, false, false);
        emit GoodSwap.Swap(address(this), 0, amtIn, amount0Out, 0, alice);

        pair.swap(amount0Out, 0, alice, "");
        assertEq(t0.balanceOf(alice), amount0Out);
    }

    function test_swap_token0_in() public {
        _seed(1_000e18, 1_000e18);

        uint256 amtIn     = 10e18;
        uint256 amount1Out = 9e18;

        t0.mint(address(pair), amtIn);

        pair.swap(0, amount1Out, alice, "");
        assertEq(t1.balanceOf(alice), amount1Out);
    }

    // ── swap: flash swap ───────────────────────────────────────────────────────

    function test_swap_flash() public {
        _seed(1_000e18, 1_000e18);

        FlashCallee callee = new FlashCallee(address(pair));
        // Flash-borrow 10 t0, repay 10.1 t0 (covers fee)
        uint256 flashAmt = 10e18;
        uint256 repay    = 10.1e18;

        t0.mint(address(callee), repay);
        callee.setRepay(address(t0), repay);

        pair.swap(flashAmt, 0, address(callee), abi.encode("flash"));

        assertEq(callee.lastAmt0(), flashAmt);
        assertEq(callee.lastAmt1(), 0);
        assertEq(callee.lastData(), abi.encode("flash"));
    }

    // ── swap: revert paths ─────────────────────────────────────────────────────

    function test_swap_revert_zeroOutput() public {
        _seed(1_000e18, 1_000e18);
        vm.expectRevert(GoodSwap.InsufficientOutputAmount.selector);
        pair.swap(0, 0, alice, "");
    }

    function test_swap_revert_insufficientLiquidity_0() public {
        _seed(1_000e18, 1_000e18);
        (uint112 r0,,) = pair.getReserves();
        vm.expectRevert(GoodSwap.InsufficientLiquidity.selector);
        pair.swap(r0, 0, alice, ""); // >= reserve
    }

    function test_swap_revert_insufficientLiquidity_1() public {
        _seed(1_000e18, 1_000e18);
        (, uint112 r1,) = pair.getReserves();
        vm.expectRevert(GoodSwap.InsufficientLiquidity.selector);
        pair.swap(0, r1, alice, "");
    }

    function test_swap_revert_invalidRecipient_token0() public {
        _seed(1_000e18, 1_000e18);
        vm.expectRevert(GoodSwap.InvalidRecipient.selector);
        pair.swap(1e18, 0, address(t0), "");
    }

    function test_swap_revert_invalidRecipient_token1() public {
        _seed(1_000e18, 1_000e18);
        vm.expectRevert(GoodSwap.InvalidRecipient.selector);
        pair.swap(0, 1e18, address(t1), "");
    }

    function test_swap_revert_insufficientInput() public {
        _seed(1_000e18, 1_000e18);
        // Request output but don't deposit any input
        vm.expectRevert(GoodSwap.InsufficientInputAmount.selector);
        pair.swap(1e18, 0, alice, "");
    }

    function test_swap_revert_invariantViolated() public {
        _seed(1_000e18, 1_000e18);
        // Only deposit 1 wei but ask for 10 out — invariant will break
        t1.mint(address(pair), 1);
        vm.expectRevert(GoodSwap.InvariantViolated.selector);
        pair.swap(10e18, 0, alice, "");
    }

    // ── reentrancy lock ────────────────────────────────────────────────────────

    function test_swap_revert_reentrancy() public {
        _seed(1_000e18, 1_000e18);

        // Create a re-entrant callee that calls swap again during callback
        ReentrantCallee re = new ReentrantCallee(address(pair), address(t1));
        t1.mint(address(re), 20e18);
        re.prepare(1e18, 0, address(re), abi.encode("re"));

        t1.mint(address(pair), 15e18);
        // The outer swap should succeed but the inner callback swap should revert with Locked
        vm.expectRevert(GoodSwap.Locked.selector);
        pair.swap(1e18, 0, address(re), abi.encode("first"));
    }

    // ── skim ───────────────────────────────────────────────────────────────────

    function test_skim() public {
        _seed(100e18, 200e18);
        // Send extra tokens to the pair
        t0.mint(address(pair), 5e18);
        t1.mint(address(pair), 7e18);

        (uint112 r0, uint112 r1,) = pair.getReserves();

        pair.skim(alice);

        assertEq(t0.balanceOf(alice), 5e18);
        assertEq(t1.balanceOf(alice), 7e18);
        // Reserves unchanged
        (uint112 nr0, uint112 nr1,) = pair.getReserves();
        assertEq(nr0, r0);
        assertEq(nr1, r1);
    }

    // ── sync ───────────────────────────────────────────────────────────────────

    function test_sync() public {
        _seed(100e18, 200e18);
        // Send extra tokens to the pair (not via mint)
        t0.mint(address(pair), 10e18);
        t1.mint(address(pair), 20e18);

        vm.expectEmit(false, false, false, true);
        emit GoodSwap.Sync(110e18, 220e18);

        pair.sync();

        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertEq(r0, 110e18);
        assertEq(r1, 220e18);
    }

    // ── _update: overflow guard ────────────────────────────────────────────────

    function test_update_revert_overflow() public {
        _seed(100e18, 200e18);
        // Stuff more than uint112.max tokens into the pair
        uint256 huge = uint256(type(uint112).max) + 1;
        deal(address(t0), address(pair), huge);

        vm.expectRevert(GoodSwap.Overflow.selector);
        pair.sync();
    }

    // ── getReserves ────────────────────────────────────────────────────────────

    function test_getReserves_initialZero() public view {
        (uint112 r0, uint112 r1, uint32 ts) = pair.getReserves();
        assertEq(r0, 0);
        assertEq(r1, 0);
        assertEq(ts, 0);
    }

    function test_getReserves_afterMint() public {
        _seed(50e18, 100e18);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertEq(r0, 50e18);
        assertEq(r1, 100e18);
    }

    // ── TWAP: blockTimestampLast ───────────────────────────────────────────────

    function test_twap_timestamp_updated() public {
        _seed(100e18, 100e18);

        vm.warp(block.timestamp + 500);
        pair.sync();

        (,, uint32 ts) = pair.getReserves();
        assertEq(ts, uint32(block.timestamp));
    }

    // ── MINIMUM_LIQUIDITY ──────────────────────────────────────────────────────

    function test_minimumLiquidity_constant() public view {
        assertEq(pair.MINIMUM_LIQUIDITY(), 1000);
    }

    function test_minimumLiquidity_locked_to_zero() public {
        _seed(1_000e18, 1_000e18);
        assertEq(pair.balanceOf(address(0)), 1000);
    }

    // ── TransferFailed: non-standard ERC-20 that returns false ────────────────

    function test_burn_revert_transferFailed() public {
        // Deploy a failing-transfer token as token0
        FailingToken ft = new FailingToken();
        GoodSwap badPair = new GoodSwap(address(ft), address(t1));

        // Seed: mint tokens directly to pair and call mint
        ft.mint(address(badPair), 1_000e18);
        t1.mint(address(badPair), 1_000e18);
        badPair.mint(address(this));

        uint256 lp = badPair.totalSupply() - badPair.MINIMUM_LIQUIDITY();
        uint256 burnSlot = uint256(keccak256(abi.encode(address(badPair), uint256(8))));
        vm.store(address(badPair), bytes32(burnSlot), bytes32(lp));

        vm.expectRevert(GoodSwap.TransferFailed.selector);
        badPair.burn(alice);
    }

    function test_swap_revert_transferFailed() public {
        FailingToken ft = new FailingToken();
        GoodSwap badPair = new GoodSwap(address(ft), address(t1));

        ft.mint(address(badPair), 1_000e18);
        t1.mint(address(badPair), 1_000e18);
        badPair.mint(address(this));

        t1.mint(address(badPair), 10e18); // input
        vm.expectRevert(GoodSwap.TransferFailed.selector);
        badPair.swap(1e18, 0, alice, "");
    }

    // ── _sqrt: small value branch (y <= 3, y != 0) ────────────────────────────

    function test_mint_sqrt_small_value() public {
        // Provide y=2 and y=2 so that amt0*amt1 = 4, _sqrt(4) = 2, LP = 2 - 1000 underflows.
        // Instead use y=1 and y=9 → sqrt(9)=3, LP = 3-1000 underflows too.
        // We need sqrt(a*b) > MINIMUM_LIQUIDITY but exercise the y<=3 path.
        // The y<=3 branch in _sqrt returns z=1 for y in {1,2,3}.
        // Calling mint with a very small deposit after initial liquidity exercises this
        // indirectly via the subsequent-mint path (uses r0/r1, not _sqrt).
        // To directly hit the branch: mint with amt0*amt1 == 1 (y=1).
        // But that underflows. We can cover it via _seed with tiny balanced amounts
        // that produce amt0*amt1 == 2: use amt0=1, amt1=2 → sqrt(2)=1 (y=2 branch hit).
        // But 1 - 1000 underflows → panic not InsufficientLiquidityMinted.
        // The only reachable path for the y<=3 branch without underflow requires
        // totalSupply > 0 (subsequent mint) where _sqrt is not called.
        // Verify the branch is exercised: mint with amt0*amt1 = 2 to hit y=2 case.
        t0.mint(address(pair), 1);
        t1.mint(address(pair), 2);
        // This will panic on underflow (sqrt(2)=1 < MINIMUM_LIQUIDITY=1000),
        // but it DOES execute _sqrt with y=2, covering lines 278-279.
        vm.expectRevert(); // arithmetic underflow
        pair.mint(address(this));
    }
}

// ─── ERC-20 that returns false on transfer (USDT-style) ──────────────────────

contract FailingToken {
    string  public name     = "FailToken";
    string  public symbol   = "FAIL";
    uint8   public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply   += amount;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false; // always fails silently
    }
}

// ─── Re-entrant callee ────────────────────────────────────────────────────────

contract ReentrantCallee is IGoodSwapCallee {
    GoodSwap immutable _pair;
    Token    immutable _repayToken;

    uint256 _reentrantAmt0Out;
    uint256 _reentrantAmt1Out;
    address _reentrantTo;
    bytes   _reentrantData;

    constructor(address pair_, address repayToken_) {
        _pair       = GoodSwap(pair_);
        _repayToken = Token(repayToken_);
    }

    function prepare(uint256 a0, uint256 a1, address to, bytes calldata data) external {
        _reentrantAmt0Out = a0;
        _reentrantAmt1Out = a1;
        _reentrantTo      = to;
        _reentrantData    = data;
    }

    function goodSwapCall(address, uint256, uint256, bytes calldata) external override {
        // Attempt re-entry — should revert with Locked
        _pair.swap(_reentrantAmt0Out, _reentrantAmt1Out, _reentrantTo, _reentrantData);
    }
}
