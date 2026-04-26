import { Module } from "@nestjs/common";
import { AuthRequiredHttpGuard, MfaRequiredHttpGuard } from "./modules/auth/guards/http-auth.guard";
import { AssurMatchRuntime } from "./runtime/assurmatch-runtime";
import { RuntimeHttpController } from "./runtime/runtime-http.controller";

export class AppModule {}

Module({
  controllers: [RuntimeHttpController],
  providers: [AssurMatchRuntime, AuthRequiredHttpGuard, MfaRequiredHttpGuard],
  exports: [AssurMatchRuntime]
})(AppModule);
