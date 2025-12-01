"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateJwtToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const common_1 = require("../common");
const generateJwtToken = (tokenPayload, jwtConfig) => {
    if (!jwtConfig.secret ||
        (!jwtConfig.expiresIn && !jwtConfig.jwtOptions?.expiresIn)) {
        throw new common_1.MedusaError(common_1.MedusaError.Types.INVALID_ARGUMENT, "JWT secret and expiresIn must be provided when generating a token");
    }
    const expiresIn = jwtConfig.expiresIn ?? jwtConfig.jwtOptions?.expiresIn;
    return jsonwebtoken_1.default.sign(tokenPayload, jwtConfig.secret, {
        ...jwtConfig.jwtOptions,
        expiresIn,
    });
};
exports.generateJwtToken = generateJwtToken;
//# sourceMappingURL=token.js.map