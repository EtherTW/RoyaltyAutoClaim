// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Vm.sol";

library ZKUtils {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function parseJsonProof()
        internal
        view
        returns (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[12] memory signals)
    {
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/proof.json");
        string memory json = vm.readFile(path);

        // Parse each array element
        uint256[] memory aArray = vm.parseJsonUintArray(json, ".[0]");
        a = [aArray[0], aArray[1]];

        // For nested b array, parse each sub-array
        uint256[] memory b0Array = vm.parseJsonUintArray(json, ".[1][0]");
        uint256[] memory b1Array = vm.parseJsonUintArray(json, ".[1][1]");
        b = [[b0Array[0], b0Array[1]], [b1Array[0], b1Array[1]]];

        uint256[] memory cArray = vm.parseJsonUintArray(json, ".[2]");
        c = [cArray[0], cArray[1]];

        uint256[] memory signalsArray = vm.parseJsonUintArray(json, ".[3]");
        for (uint256 i = 0; i < signalsArray.length; i++) {
            signals[i] = signalsArray[i];
        }
    }
}
