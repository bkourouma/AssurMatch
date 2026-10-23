import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { AdminInsurersController } from "./admin-insurers.controller";
import { MemoryInsurersRepository, type InsurersRepository } from "./insurers.repository";
import { InsurersService } from "./insurers.service";

export class InsurersModule {
  readonly repository: InsurersRepository;
  readonly service: InsurersService;
  readonly adminController: AdminInsurersController;

  constructor(audit = new AuditLogWriter(), repository: InsurersRepository = new MemoryInsurersRepository()) {
    this.repository = repository;
    this.service = new InsurersService(this.repository, audit);
    this.adminController = new AdminInsurersController(this.service);
  }
}

export { INSURERS_REPOSITORY, MemoryInsurersRepository, PrismaInsurersRepository, type InsurersRepository } from "./insurers.repository";
