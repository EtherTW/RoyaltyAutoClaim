// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {IRoyaltyAutoClaim, RoyaltyAutoClaim} from "../src/RoyaltyAutoClaim.sol";

/// @dev Reproduce email 3's AA24 on a Base fork:
///      forge test --match-contract DebugEmail3VGL --fork-url https://mainnet.base.org -vvv
contract DebugEmail3VGLTest is Test {
    address constant RAC = 0x3991CB2b0744AEDb8F985E0d1C74d8dAe6a30433;
    address constant ENTRY_POINT = 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108;

    // From parsing emails/debug-email3.eml (same values the frontend put in callData)
    string constant TITLE = unicode"原生抽象帳戶: EIP-8141 Frame Transaction - part II by Kimi";
    address constant RECIPIENT = 0x998a30cc97703b862e32B16eC32Dba9712a8117A;
    bytes32 constant NULLIFIER = 0x0d4cabca152c2e086d0417043da1fa9d283a10093352b7c7891c8e079cfb602e;

    // Default userOpHash baked into the locally generated proof (circuit-utils.ts default)
    bytes32 constant USER_OP_HASH = 0x00b917632b69261f21d20e0cabdf9f3fa1255c6e500021997a16cf3a46d80297;

    function setUp() public {
        // Incident replay test — requires a Base mainnet fork (see contract natspec).
        // Skip in non-forked runs (e.g. CI).
        if (RAC.code.length == 0) vm.skip(true);
    }

    function _buildUserOp() internal view returns (PackedUserOperation memory op) {
        op.sender = RAC;
        op.callData = abi.encodeCall(IRoyaltyAutoClaim.registerSubmission4337, (TITLE, RECIPIENT, NULLIFIER));
        op.signature = vm.parseBytes(
            vm.readFile("./incidents/2026-06-06-email-registration-failures/artifacts/email3-proof-signature.hex")
        );
    }

    function _validateWithGas(uint256 gasLimit) internal returns (uint256 validationData, uint256 gasUsed) {
        PackedUserOperation memory op = _buildUserOp();
        vm.prank(ENTRY_POINT);
        uint256 gasBefore = gasleft();
        validationData = RoyaltyAutoClaim(payable(RAC)).validateUserOp{gas: gasLimit}(op, USER_OP_HASH, 0);
        gasUsed = gasBefore - gasleft();
    }

    function test_validate_with_predefined_vgl_3_2M() public {
        (uint256 validationData, uint256 gasUsed) = _validateWithGas(3_200_000);
        console.log("VGL 3.2M -> validationData:", validationData, "gasUsed:", gasUsed);
        // validationData 1 == SIG_VALIDATION_FAILED == AA24
    }

    function test_validate_with_vgl_4M() public {
        (uint256 validationData, uint256 gasUsed) = _validateWithGas(4_000_000);
        console.log("VGL 4.0M -> validationData:", validationData, "gasUsed:", gasUsed);
    }

    function test_find_minimal_vgl() public {
        uint256 lo = 3_000_000;
        uint256 hi = 5_000_000;
        // bisect minimal gas where validateUserOp returns 0
        while (hi - lo > 10_000) {
            uint256 mid = (lo + hi) / 2;
            uint256 snap = vm.snapshotState();
            (uint256 validationData,) = _validateWithGas(mid);
            vm.revertToState(snap);
            if (validationData == 0) hi = mid;
            else lo = mid;
        }
        console.log("minimal VGL for validationData==0 is around:", hi);
    }
}
