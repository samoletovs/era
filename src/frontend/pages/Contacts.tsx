import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Contacts() {
  const { companyId } = useApp();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    api.contacts(companyId).then((data: any) => { setContacts(data); setLoading(false); }).catch(() => setLoading(false));
  }, [companyId]);

  if (!companyId) return (
    <div className="empty-state">
      <div className="icon">🏢</div>
      <h3>No company selected</h3>
      <p>Use the agent chat to create a company first.</p>
    </div>
  );

  return (
    <div>
      <h2 className="page-title">Contacts</h2>
      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : contacts.length === 0 ? (
        <div className="empty-state">
          <div className="icon">👥</div>
          <h3>No contacts yet</h3>
          <p>Use the agent chat: "Add a customer SIA Acme in Riga"</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Email</th><th>Reg. number</th><th>City</th></tr>
          </thead>
          <tbody>
            {contacts.map((c: any) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td><span className="badge">{c.type}</span></td>
                <td>{c.email || "—"}</td>
                <td className="mono">{c.registrationNumber || "—"}</td>
                <td>{c.address?.city || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
