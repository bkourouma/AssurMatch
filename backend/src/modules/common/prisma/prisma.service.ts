type TransactionCallback<T> = (client: PrismaService) => Promise<T>;

export class PrismaService {
  readonly connectedAt = new Date();

  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    return callback(this);
  }

  async health(): Promise<"ok"> {
    return "ok";
  }
}
