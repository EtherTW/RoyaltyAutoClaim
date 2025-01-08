// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MockV2 is UUPSUpgradeable, OwnableUpgradeable {
    string internal constant RENUNCIATION_DISABLED = "Renouncing ownership is disabled";

    address public admin;
    address public token; // 稿費幣種
    address[] public reviewers;

    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner, address _admin, address _token, address[] memory _reviewers)
        public
        reinitializer(2)
    {
        __Ownable_init(_owner);
        admin = _admin;
        token = _token;
        reviewers = _reviewers;
    }

    // ================================ Ownership ================================

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function changeAdmin(address _admin) public onlyOwner {
        admin = _admin;
    }

    function changeRoyaltyToken(address _token) public onlyOwner {
        token = _token;
    }

    function renounceOwnership() public pure override {
        revert(RENUNCIATION_DISABLED);
    }
}
