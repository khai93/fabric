import { describe, expect, test } from "bun:test";
import { detectImports } from "./detectImports";
import { detectRoutes } from "./detectRoutes";

describe("static detectors", () => {
  test("detects imports", () => {
    const imports = detectImports(`
import authService from "../services/auth";
const token = require("./token");
export { userRepo } from "../repositories/user";
`);

    expect(imports.map((item) => item.specifier)).toEqual([
      "../repositories/user",
      "../services/auth",
      "./token"
    ]);
  });

  test("detects simple Express routes", () => {
    const routes = detectRoutes(`
app.get("/users", listUsers);
router.post("/login", login);
app.use("/auth", authRouter);
`);

    expect(routes.map((route) => route.idHint)).toEqual([
      "route.auth",
      "route.get.users",
      "route.post.login"
    ]);
  });
});
