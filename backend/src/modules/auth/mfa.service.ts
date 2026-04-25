import type { UserAccount } from "../users/users.module";

export interface MfaChallenge {
  challengeId: string;
  userId: string;
  code: string;
  createdAt: Date;
}

export class MfaService {
  private readonly challenges: MfaChallenge[] = [];

  enroll(user: UserAccount): MfaChallenge {
    const challenge: MfaChallenge = {
      challengeId: crypto.randomUUID(),
      userId: user.id,
      code: "123456",
      createdAt: new Date()
    };
    user.mfaStatus = "enrolled";
    this.challenges.push(challenge);
    return challenge;
  }

  verify(user: UserAccount, challengeId: string, code: string): boolean {
    const challenge = this.challenges.find((candidate) => candidate.challengeId === challengeId && candidate.userId === user.id);
    if (!challenge || challenge.code !== code) return false;
    user.mfaStatus = "verified";
    return true;
  }
}
