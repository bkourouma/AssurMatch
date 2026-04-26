import { Module } from "@nestjs/common";
import { RuntimeHttpWiringModule } from "./modules/http-wiring/runtime-http-wiring.module";

export class AppModule {}

Module({
  imports: [RuntimeHttpWiringModule]
})(AppModule);
