export interface EnterpriseAcceptanceSeedSummary {
  countries: number;
  products: number;
  partners: number;
  users: number;
}

export function enterpriseAcceptanceSeedSummary(): EnterpriseAcceptanceSeedSummary {
  return {
    countries: 50,
    products: 500,
    partners: 5000,
    users: 100000
  };
}
