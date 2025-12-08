"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRejectedActionError = exports.EthersError = void 0;
exports.isUserRejectedError = isUserRejectedError;
exports.isEthersError = isEthersError;
exports.extractAndParseRevert = extractAndParseRevert;
exports.handleUserOpError = handleUserOpError;
exports.parseContractRevert = parseContractRevert;
exports.normalizeError = normalizeError;
exports.formatErrMsg = formatErrMsg;
var ethers_1 = require("ethers");
var sendop_1 = require("sendop");
var typechain_types_1 = require("../typechain-types");
var typechain_v2_1 = require("../typechain-v2");
/**
 * Checks if an error indicates a user rejection from browser wallet or passkey.
 */
function isUserRejectedError(error) {
    if (error instanceof Error) {
        if (isEthersError(error)) {
            if ((0, ethers_1.isError)(error, 'ACTION_REJECTED')) {
                return true;
            }
        }
        if (
        // desktop chrome error
        error.message.includes('The operation either timed out or was not allowed') ||
            // mobile chrome error
            error.message.includes('The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.')) {
            return true;
        }
    }
    return false;
}
function isEthersError(error) {
    var validErrorCodes = [
        'UNKNOWN_ERROR',
        'NOT_IMPLEMENTED',
        'UNSUPPORTED_OPERATION',
        'NETWORK_ERROR',
        'SERVER_ERROR',
        'TIMEOUT',
        'BAD_DATA',
        'CANCELLED',
        'BUFFER_OVERRUN',
        'NUMERIC_FAULT',
        'INVALID_ARGUMENT',
        'MISSING_ARGUMENT',
        'UNEXPECTED_ARGUMENT',
        'VALUE_MISMATCH',
        'CALL_EXCEPTION',
        'INSUFFICIENT_FUNDS',
        'NONCE_EXPIRED',
        'REPLACEMENT_UNDERPRICED',
        'TRANSACTION_REPLACED',
        'UNCONFIGURED_NAME',
        'OFFCHAIN_FAULT',
        'ACTION_REJECTED',
    ];
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
        return validErrorCodes.includes(error.code);
    }
    return false;
}
function extractAndParseRevert(err, interfaces) {
    var _a;
    // Alchemy format: structured revertData property
    if ((_a = err.data) === null || _a === void 0 ? void 0 : _a.revertData) {
        return parseContractRevert(err.data.revertData, interfaces);
    }
    // Pimlico format: hex string embedded in error message
    var revertData = (0, sendop_1.extractHexString)(err.message);
    if (revertData) {
        return parseContractRevert(revertData, interfaces);
    }
    return '';
}
function handleUserOpError(e) {
    var _a;
    var revert = (0, sendop_1.extractHexString)(e.message) || '';
    var customError = parseContractRevert(revert, {
        RoyaltyAutoClaim: typechain_types_1.RoyaltyAutoClaim__factory.createInterface(),
        RegistrationVerifier: typechain_v2_1.RegistrationVerifier__factory.createInterface(),
    });
    if (customError) {
        console.info((_a = {},
            _a[revert] = customError,
            _a));
    }
    throw e;
}
function parseContractRevert(revert, interfaces, nameOnly) {
    if (nameOnly === void 0) { nameOnly = true; }
    if (!revert)
        return '';
    for (var _i = 0, _a = Object.entries(interfaces); _i < _a.length; _i++) {
        var _b = _a[_i], name_1 = _b[0], iface = _b[1];
        try {
            var decodedError = iface.parseError(revert);
            if (decodedError) {
                var errorArgs = decodedError.args.length > 0 ? "(".concat(decodedError.args.join(', '), ")") : '';
                if (nameOnly) {
                    return "".concat(decodedError.name).concat(errorArgs);
                }
                return "".concat(name_1, ".").concat(decodedError.name).concat(errorArgs, " (Note: The prefix \"").concat(name_1, "\" may not correspond to the actual contract that triggered the revert.)");
            }
        }
        catch (_c) {
            // Continue to next interface if parsing fails
            continue;
        }
    }
    return '';
}
// Returned error is used for console.error
function normalizeError(unknownError) {
    if (unknownError instanceof Error) {
        return unknownError;
    }
    return new Error(JSON.stringify(unknownError));
}
// Returned string is used for UI notification
function formatErrMsg(error) {
    // Special handling for eth_estimateUserOperationGas errors
    if (error.message.includes('eth_estimateUserOperationGas')) {
        // Try to extract JSON data for AlchemyBundler format
        var jsonMatch = error.message.match(/\{.*\}/);
        if (jsonMatch) {
            var errorData = JSON.parse(jsonMatch[0]);
            var revertData = errorData.revertData === '0x' ? '' : errorData.revertData;
            var reason_1 = errorData.reason;
            var decodedErrMsg = revertData ? decodeContractError(revertData) : '';
            var parts = [];
            if (reason_1)
                parts.push(reason_1);
            if (decodedErrMsg) {
                parts.push(decodedErrMsg);
            }
            else if (revertData) {
                parts.push(revertData);
            }
            return parts.length > 0 ? "Estimation failed: ".concat(parts.join(' ')) : 'Estimation failed';
        }
        function decodeContractError(revertData) {
            var ifaceRAC = new ethers_1.Interface(typechain_types_1.RoyaltyAutoClaim__factory.abi);
            var ifaceERC20 = new ethers_1.Interface(typechain_types_1.MockToken__factory.abi);
            var decodedError = ifaceRAC.parseError(revertData);
            if (!decodedError) {
                decodedError = ifaceERC20.parseError(revertData);
            }
            if (!decodedError)
                return '';
            var errorArgs = decodedError.args.length > 0 ? "(".concat(decodedError.args.join(', '), ")") : '';
            return "".concat(decodedError.name).concat(errorArgs);
        }
        // Fallback to existing logic for PimlicoBundler format
        var reasonMatch = error.message.match(/UserOperation reverted during simulation with reason: (.+)$/);
        var reason = reasonMatch === null || reasonMatch === void 0 ? void 0 : reasonMatch[1];
        // extract hex data from the end of the message
        var hexDataMatch = error.message.match(/(0x[a-fA-F0-9]+)(?![0-9a-fA-F])/);
        var hexData = hexDataMatch === null || hexDataMatch === void 0 ? void 0 : hexDataMatch[1];
        if (reason && hexData) {
            var iface = new ethers_1.Interface(typechain_types_1.RoyaltyAutoClaim__factory.abi);
            var decodedError = iface.parseError(hexData);
            if (decodedError) {
                var reasonWithoutHexData = reason.replace(hexData, '').trim();
                var errorArgs = decodedError.args.length > 0 ? "(".concat(decodedError.args.join(', '), ")") : '';
                return "Estimation failed:".concat(reasonWithoutHexData ? ' ' + reasonWithoutHexData : '', " ").concat(decodedError.name).concat(errorArgs);
            }
        }
        else if (reason) {
            return "Estimation failed: ".concat(reason);
        }
        else {
            return "Estimation failed";
        }
    }
    return "".concat(error.name, ": ").concat(error.message);
}
// ================================ Error classes =================================
var EthersError = /** @class */ (function (_super) {
    __extends(EthersError, _super);
    function EthersError(message, options) {
        var _this = _super.call(this, message, options) || this;
        _this.code = 'UNKNOWN_ERROR';
        _this.name = 'EthersError';
        if ((options === null || options === void 0 ? void 0 : options.cause) && EthersError.isEthersError(options.cause)) {
            var ethersError = options.cause;
            _this.code = ethersError.code;
            _this.message = _this.message.replace(/^([^(]+).*/, '$1').trim();
            if (ethersError.name === 'Error') {
                _this.name = "EthersError";
            }
            else {
                _this.name = "EthersError(".concat(ethersError.name, ")");
            }
        }
        return _this;
    }
    EthersError.isEthersError = function (error) {
        if (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            typeof error.code === 'string' &&
            'name' in error &&
            typeof error.name === 'string') {
            return (0, ethers_1.isError)(error, error.code);
        }
        return false;
    };
    return EthersError;
}(Error));
exports.EthersError = EthersError;
// Thrown when the user rejects the transaction in the wallet
var UserRejectedActionError = /** @class */ (function (_super) {
    __extends(UserRejectedActionError, _super);
    function UserRejectedActionError(message, options) {
        var _this = _super.call(this, message, options) || this;
        _this.name = 'UserRejectedActionError';
        return _this;
    }
    return UserRejectedActionError;
}(Error));
exports.UserRejectedActionError = UserRejectedActionError;
