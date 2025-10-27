// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {IRegistrationVerifier} from "../../src/RegistrationVerifier.sol";

library ZKUtils {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function parseJsonProof() internal view returns (IRegistrationVerifier.ZkEmailProof memory proof) {
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/proof.json");
        string memory json = vm.readFile(path);

        // Parse each array element
        uint256[] memory aArray = vm.parseJsonUintArray(json, ".[0]");
        proof.a = [aArray[0], aArray[1]];

        // For nested b array, parse each sub-array
        uint256[] memory b0Array = vm.parseJsonUintArray(json, ".[1][0]");
        uint256[] memory b1Array = vm.parseJsonUintArray(json, ".[1][1]");
        proof.b = [[b0Array[0], b0Array[1]], [b1Array[0], b1Array[1]]];

        uint256[] memory cArray = vm.parseJsonUintArray(json, ".[2]");
        proof.c = [cArray[0], cArray[1]];

        uint256[] memory signalsArray = vm.parseJsonUintArray(json, ".[3]");
        for (uint256 i = 0; i < signalsArray.length; i++) {
            proof.signals[i] = signalsArray[i];
        }
    }
}
