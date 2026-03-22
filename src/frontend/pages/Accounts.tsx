import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Accounts() {
  const { companyId } = useApp();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    api.accounts(companyId).then((data: any) => { setAccounts(data); setLoading(false); }).catch(() => setLoading(false));
  }, [companyId]);

  if (!companyId) return <NoCompany />;

  return (
    <div>
      <h2 className="page-title">Chart of accounts</h2>
      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : (
        <table className="data-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Type</th><th>Balance</th></tr>
          </thead>
          <tbody>
            {accounts.filter((a: any) => a.isPostable).map((a: any) => (
              <tr key={a.id}>
                <td className="mono">{a.code}</td>
                <td>{a.name}</td>
                <td><span className="badge">{a.type}</span></td>
                <td className="num">€{a.balance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NoCompany() {
  return (
    <div className="empty-state">
      <div className="icon">🏢</div>
      <h3>No company selected</h3>
      <p>Use the agent chat to create a company first: "Create a company called SIA MyCompany"</p>
    </div>
  );
}
