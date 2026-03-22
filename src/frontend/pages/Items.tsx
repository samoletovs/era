import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Items() {
  const { companyId } = useApp();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    api.items(companyId).then((data: any) => { setItems(data); setLoading(false); }).catch(() => setLoading(false));
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
      <h2 className="page-title">Items</h2>
      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : items.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📦</div>
          <h3>No items yet</h3>
          <p>Use the agent chat: "Create a service item: Consulting, €80/hour"</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Type</th><th>Price</th><th>VAT</th><th>On hand</th></tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id}>
                <td className="mono">{item.code}</td>
                <td>{item.name}</td>
                <td><span className="badge">{item.type}</span></td>
                <td className="num">€{item.sellingPrice.toFixed(2)}</td>
                <td>{item.vatRate}%</td>
                <td className="num">{item.type === "service" ? "—" : item.quantityOnHand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
