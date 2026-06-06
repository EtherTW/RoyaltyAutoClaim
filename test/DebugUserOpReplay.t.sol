// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {IRoyaltyAutoClaim, RoyaltyAutoClaim} from "../src/RoyaltyAutoClaim.sol";

/// @dev Replay the user's exact failed op (attempt 2, nonce key 0x5698f7c2589ef093) on a Base fork.
///      The submission was registered in block 46967486, so pin the fork to a block before it:
///      forge test --match-contract DebugUserOpReplay --fork-url https://mainnet.base.org --fork-block-number 46967000 -vv
contract DebugUserOpReplayTest is Test {
    address constant RAC = 0x3991CB2b0744AEDb8F985E0d1C74d8dAe6a30433;
    address constant ENTRY_POINT = 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108;

    string constant TITLE = unicode"原生抽象帳戶: EIP-8141 Frame Transaction - part II by Kimi";
    address constant RECIPIENT = 0x998a30cc97703b862e32B16eC32Dba9712a8117A;
    bytes32 constant NULLIFIER = 0x0d4cabca152c2e086d0417043da1fa9d283a10093352b7c7891c8e079cfb602e;

    // EntryPoint-verified hash of the user's actual op (== hash baked into the proof)
    bytes32 constant USER_OP_HASH = 0x7fc5fece3f13e7934754130bcaaa01afd978d46e5d9f84128a7c188bc8b99647;

    function _buildUserOp() internal view returns (PackedUserOperation memory op) {
        op.sender = RAC;
        op.nonce = uint256(0x5698f7c2589ef093) << 64;
        op.callData = abi.encodeCall(IRoyaltyAutoClaim.registerSubmission4337, (TITLE, RECIPIENT, NULLIFIER));
        op.accountGasLimits = bytes32((uint256(3_200_000) << 128) | uint256(58_237));
        op.preVerificationGas = 485_795;
        op.gasFees = bytes32((uint256(10_708_766) << 128) | uint256(43_835_141));
        op.signature = vm.parseBytes(
            vm.readFile("./incidents/2026-06-06-email-registration-failures/artifacts/user-op-signature.hex")
        );
    }

    /// @dev mirror the real flow: nonzero missingAccountFunds, exact VGL as call gas
    function test_replay_user_op_with_prefund() public {
        PackedUserOperation memory op = _buildUserOp();
        // requiredPrefund at maxFee for all gas: ~0.000164 ETH, deposit ~0.0000051 ETH
        uint256 missing = 43_835_141 * (3_200_000 + 58_237 + 485_795) - 5_138_943_915_461;
        vm.prank(ENTRY_POINT);
        uint256 gasBefore = gasleft();
        uint256 validationData =
            RoyaltyAutoClaim(payable(RAC)).validateUserOp{gas: 3_200_000}(op, USER_OP_HASH, missing);
        console.log("validationData:", validationData, "gasUsed:", gasBefore - gasleft());
    }
}
