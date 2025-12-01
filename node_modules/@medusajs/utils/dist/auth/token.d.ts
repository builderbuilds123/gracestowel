import { type Secret, type SignOptions } from "jsonwebtoken";
export declare const generateJwtToken: (tokenPayload: Record<string, unknown>, jwtConfig: {
    secret?: Secret;
    expiresIn?: number | string;
    jwtOptions?: SignOptions;
}) => string;
//# sourceMappingURL=token.d.ts.map