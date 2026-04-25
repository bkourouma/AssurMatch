import { LeadAssignmentService } from "./lead-assignment.service";

export class AdminLeadAssignmentsController {
  constructor(private readonly assignments: LeadAssignmentService) {}

  list() {
    return this.assignments.list();
  }

  detail(id: string) {
    return this.assignments.require(id);
  }
}
