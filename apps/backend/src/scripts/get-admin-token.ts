import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import jwt from "jsonwebtoken";

export default async function getAdminToken({ container }: ExecArgs) {
  const configModule = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
  // @ts-ignore
  const secret = configModule.projectConfig.http.jwtSecret || process.env.JWT_SECRET || "supersecret";

  const token = jwt.sign({
     actor_id: "user_01KCQDPJ68BR9E69GS8A99RR9C",
     actor_type: "user",
     scope: "admin",
     iat: Math.floor(Date.now() / 1000),
     exp: Math.floor(Date.now() / 1000) + (3600 * 24 * 7)
  }, secret, { algorithm: "HS256" });

  console.log(`ADMIN_TOKEN=${token}`);
}
