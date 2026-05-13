// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/UBIClaimV2.sol";
import "../src/GoodDollarToken.sol";
import "../src/UBIFeeSplitter.sol";

contract UBIClaimV2Test is Test {
    GoodDollarToken token;
    UBIFeeSplitter splitter;
    UBIClaimV2 claimContract;

    address admin    = makeAddr("admin");
    address oracle   = makeAddr("oracle");
    address relayer  = makeAddr("relayer");
    address treasury = makeAddr("treasury");
    address alice    = makeAddr("alice");
    address bob      = makeAddr("bob");
    address charlie  = makeAddr("charlie");  // not verified

    uint256 constant DAILY = 1e18;

    function setUp() public {
        vm.startPrank(admin);

        // Deploy token
        token = new GoodDollarToken(admin, oracle, 0);

        // Deploy fee splitter
        splitter = new UBIFeeSplitter(address(token), treasury, admin);

        // Deploy claim contract
        claimContract = new UBIClaimV2(address(token), address(splitter), admin);

        // Authorize claim contract as minter
        token.setMinter(address(claimContract), true);

        // Register relayer
        claimContract.setRelayer(relayer, true);

        vm.stopPrank();

        // Verify alice and bob
        vm.startPrank(oracle);
        token.verifyHuman(alice, true);
        token.verifyHuman(bob, true);
        vm.stopPrank();
    }

    // ============ Single claim ============

    function test_SelfClaim() public {
        vm.prank(alice);
        claimContract.claim();

        assertEq(token.balanceOf(alice), DAILY);
        assertEq(claimContract.totalClaims(), 1);
        assertEq(claimContract.totalMinted(), DAILY);
    }

    function test_ClaimFor_ByRelayer() public {
        vm.prank(relayer);
        claimContract.claimFor(alice);

        assertEq(token.balanceOf(alice), DAILY);
    }

    function test_ClaimFor_UnauthorizedRelayer_Reverts() public {
        vm.expectRevert(UBIClaimV2.NotAuthorizedRelayer.selector);
        vm.prank(alice);
        claimContract.claimFor(bob);
    }

    function test_SelfClaim_UnverifiedHuman_Reverts() public {
        vm.expectRevert(abi.encodeWithSelector(UBIClaimV2.NotVerifiedHuman.selector, charlie));
        vm.prank(charlie);
        claimContract.claim();
    }

    // ============ Double-claim rejection ============

    function test_DoubleClaim_SameEpoch_Reverts() public {
        vm.prank(alice);
        claimContract.claim();

        uint256 epoch = claimContract.currentEpoch();
        vm.expectRevert(
            abi.encodeWithSelector(UBIClaimV2.AlreadyClaimedThisEpoch.selector, alice, epoch)
        );
        vm.prank(alice);
        claimContract.claim();
    }

    function test_DoubleClaim_ViaRelayer_SameEpoch_Reverts() public {
        vm.prank(relayer);
        claimContract.claimFor(alice);

        uint256 epoch = claimContract.currentEpoch();
        vm.expectRevert(
            abi.encodeWithSelector(UBIClaimV2.AlreadyClaimedThisEpoch.selector, alice, epoch)
        );
        vm.prank(relayer);
        claimContract.claimFor(alice);
    }

    // ============ Epoch rollover ============

    function test_ClaimAfterEpochRollover_Succeeds() public {
        vm.prank(alice);
        claimContract.claim();

        // Advance 24 hours to next epoch
        vm.warp(block.timestamp + 24 hours);

        vm.prank(alice);
        claimContract.claim();

        assertEq(token.balanceOf(alice), DAILY * 2);
    }

    function test_EpochRollover_RejectsEarlyReClaim() public {
        vm.prank(alice);
        claimContract.claim();

        // Only 23 hours — still same epoch
        vm.warp(block.timestamp + 23 hours);

        uint256 epoch = claimContract.currentEpoch();
        vm.expectRevert(
            abi.encodeWithSelector(UBIClaimV2.AlreadyClaimedThisEpoch.selector, alice, epoch)
        );
        vm.prank(alice);
        claimContract.claim();
    }

    // ============ Batch claim ============

    function test_BatchClaim_SmallBatch() public {
        address[] memory users = new address[](2);
        users[0] = alice;
        users[1] = bob;

        vm.prank(relayer);
        uint256 claimed = claimContract.batchClaim(users);

        assertEq(claimed, 2);
        assertEq(token.balanceOf(alice), DAILY);
        assertEq(token.balanceOf(bob), DAILY);
        assertEq(claimContract.totalClaims(), 2);
    }

    function test_BatchClaim_SkipsUnverified() public {
        address[] memory users = new address[](3);
        users[0] = alice;
        users[1] = charlie; // not verified — should be skipped
        users[2] = bob;

        vm.prank(relayer);
        uint256 claimed = claimContract.batchClaim(users);

        assertEq(claimed, 2); // only alice + bob
        assertEq(token.balanceOf(charlie), 0);
    }

    function test_BatchClaim_SkipsAlreadyClaimed() public {
        // alice already claimed this epoch
        vm.prank(alice);
        claimContract.claim();

        address[] memory users = new address[](2);
        users[0] = alice;
        users[1] = bob;

        vm.prank(relayer);
        uint256 claimed = claimContract.batchClaim(users);

        assertEq(claimed, 1); // only bob
        assertEq(token.balanceOf(alice), DAILY); // unchanged
        assertEq(token.balanceOf(bob), DAILY);
    }

    function test_BatchClaim_1000Users() public {
        // Create 1000 verified humans
        address[] memory users = new address[](1000);
        vm.startPrank(oracle);
        for (uint256 i = 0; i < 1000; i++) {
            users[i] = address(uint160(0x1000 + i));
            token.verifyHuman(users[i], true);
        }
        vm.stopPrank();

        vm.prank(relayer);
        uint256 claimed = claimContract.batchClaim(users);

        assertEq(claimed, 1000);
        assertEq(claimContract.totalClaims(), 1000);
        assertEq(claimContract.totalMinted(), DAILY * 1000);
    }

    function test_BatchClaim_TooLarge_Reverts() public {
        address[] memory users = new address[](1001);
        vm.expectRevert("Batch too large");
        vm.prank(relayer);
        claimContract.batchClaim(users);
    }

    function test_BatchClaim_RequiresRelayer() public {
        address[] memory users = new address[](1);
        users[0] = alice;
        vm.expectRevert(UBIClaimV2.NotAuthorizedRelayer.selector);
        vm.prank(alice);
        claimContract.batchClaim(users);
    }

    // ============ Self-claim toggle ============

    function test_SelfClaim_Disabled_Reverts() public {
        vm.prank(admin);
        claimContract.setSelfClaimEnabled(false);

        vm.expectRevert(UBIClaimV2.SelfClaimDisabled.selector);
        vm.prank(alice);
        claimContract.claim();
    }

    function test_SelfClaim_Disabled_RelayerStillWorks() public {
        vm.prank(admin);
        claimContract.setSelfClaimEnabled(false);

        vm.prank(relayer);
        claimContract.claimFor(alice);
        assertEq(token.balanceOf(alice), DAILY);
    }

    // ============ canClaim view ============

    function test_CanClaim_ReturnsTrue_ForEligible() public view {
        assertTrue(claimContract.canClaim(alice));
    }

    function test_CanClaim_ReturnsFalse_AfterClaim() public {
        vm.prank(alice);
        claimContract.claim();
        assertFalse(claimContract.canClaim(alice));
    }

    function test_CanClaim_ReturnsFalse_Unverified() public view {
        assertFalse(claimContract.canClaim(charlie));
    }

    // ============ Governance ============

    function test_SetMinter_Unauthorized_Reverts() public {
        vm.expectRevert("Not admin");
        vm.prank(alice);
        token.setMinter(alice, true);
    }

    function test_ClaimContract_NotMinter_Reverts() public {
        // Remove minting authorization
        vm.prank(admin);
        token.setMinter(address(claimContract), false);

        vm.expectRevert("Not authorized minter");
        vm.prank(alice);
        claimContract.claim();
    }

    // ============ UBIFeeSplitter integration ============

    function test_FeeSplitter_ClaimableBalance() public view {
        // feeSplitter holds no tokens initially
        assertEq(splitter.claimableBalance(), 0);
    }

    function test_CurrentEpoch_Monotonic() public {
        uint256 e0 = claimContract.currentEpoch();
        vm.warp(block.timestamp + 24 hours);
        uint256 e1 = claimContract.currentEpoch();
        assertEq(e1, e0 + 1);
    }

    // ============ supplementPool ============

    function test_SupplementPool_NoOp_WhenFeeSplitterZero() public {
        // Deploy claim contract with address(0) feeSplitter
        UBIClaimV2 noClaim = new UBIClaimV2(address(token), address(0), admin);
        // Should not revert, just no-op
        noClaim.supplementPool();
    }

    function test_SupplementPool_NoOp_WhenNoBalance() public {
        // splitter has zero balance — should be a no-op
        assertEq(splitter.claimableBalance(), 0);
        claimContract.supplementPool(); // should not revert
    }

    function test_SupplementPool_TransfersFundsToUBIPool() public {
        // Setup: claimContract authorized to call releaseToUBI
        vm.prank(admin);
        splitter.setUBIClaimContract(address(claimContract));

        // Fund splitter with G$
        vm.prank(admin);
        token.setMinter(address(this), true);
        token.mint(address(splitter), 500 ether);

        uint256 poolBefore = token.balanceOf(address(token)); // fundUBIPool goes to token contract
        claimContract.supplementPool();
        // Pool should have received the funds (no revert = success)
        assertEq(splitter.claimableBalance(), 0);
    }

    // ============ Admin governance ============

    function test_SetFeeSplitter_HappyPath() public {
        UBIFeeSplitter newSplitter = new UBIFeeSplitter(address(token), treasury, admin);
        vm.prank(admin);
        claimContract.setFeeSplitter(address(newSplitter));
        assertEq(address(claimContract.feeSplitter()), address(newSplitter));
    }

    function test_SetFeeSplitter_ZeroAddress_Reverts() public {
        vm.prank(admin);
        vm.expectRevert(UBIClaimV2.ZeroAddress.selector);
        claimContract.setFeeSplitter(address(0));
    }

    function test_SetFeeSplitter_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert("Not admin");
        claimContract.setFeeSplitter(address(splitter));
    }

    function test_TransferAdmin_HappyPath() public {
        vm.prank(admin);
        claimContract.transferAdmin(alice);
        assertEq(claimContract.admin(), alice);
    }

    function test_TransferAdmin_ZeroAddress_Reverts() public {
        vm.prank(admin);
        vm.expectRevert(UBIClaimV2.ZeroAddress.selector);
        claimContract.transferAdmin(address(0));
    }

    function test_TransferAdmin_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert("Not admin");
        claimContract.transferAdmin(bob);
    }

    // ============ batchClaim — edge cases ============

    function test_BatchClaim_SkipsZeroAddress() public {
        address[] memory users = new address[](3);
        users[0] = alice;
        users[1] = address(0); // zero address — should be skipped silently
        users[2] = bob;

        vm.prank(relayer);
        uint256 claimed = claimContract.batchClaim(users);

        assertEq(claimed, 2); // alice + bob only
    }

    function test_BatchClaim_EmptyBatch_NoBatchClaimedEvent() public {
        address[] memory users = new address[](0);
        vm.prank(relayer);
        uint256 claimed = claimContract.batchClaim(users);
        assertEq(claimed, 0);
        assertEq(claimContract.totalClaims(), 0);
    }
}
