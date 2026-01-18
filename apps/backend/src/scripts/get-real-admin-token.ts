import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import jwt from "jsonwebtoken";

export default async function getRealAdminToken({ container }: ExecArgs) {
  const configModule = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
  const userModuleService = container.resolve(Modules.USER);
  
  // @ts-ignore
  const secret = configModule.projectConfig.http.jwtSecret || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  // console.log("Searching for users...");
  const users = await userModuleService.listUsers({}, { take: 1 });
  
  let userId = "";
  
  if (users.length > 0) {
    // console.log(`Found existing user: ${users[0].email} (${users[0].id})`);
    userId = users[0].id;
  } else {
    // console.log("No users found. Creating default admin user...");
    const user = await userModuleService.createUsers({
      email: "admin@medusa-test.com",
      first_name: "Admin",
      last_name: "User",
    });
    // console.log(`Created user: ${user.email} (${user.id})`);
    userId = user.id;
  }

  const token = jwt.sign({
     actor_id: userId,
     actor_type: "user",
     scope: "admin",
     iat: Math.floor(Date.now() / 1000),
     exp: Math.floor(Date.now() / 1000) + (3600 * 24 * 7)
  }, secret, { algorithm: "HS256" });

  process.stdout.write(token);
}
