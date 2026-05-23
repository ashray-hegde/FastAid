import { useEffect, useState } from 'react';
import api from '../api';

export default function AdminLockouts() {
  const [lockouts, setLockouts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLockouts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/auth/admin/lockouts');
      setLockouts(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Unable to fetch lockouts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLockouts();
  }, []);

  const handleUnlock = async (id) => {
    try {
      await api.post(`/auth/admin/lockouts/${id}/unlock`);
      setLockouts((l) => l.filter((x) => x._id !== id));
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Unable to revoke lockout');
    }
  };

  const handleRevokeAll = async () => {
    if (!confirm('Revoke all active lockouts?')) return;
    try {
      const res = await api.post('/auth/admin/lockouts/unlock-all');
      alert(res.data?.message || 'Revoked');
      fetchLockouts();
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Unable to revoke all');
    }
  };

  return (
    <div style={{ padding: 18 }}>
      <h2>Active Lockouts</h2>
      {loading && <div>Loading…</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {!loading && lockouts.length === 0 && <div>No active lockouts</div>}
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <div>
          <button className='btn btn-danger' onClick={handleRevokeAll}>Revoke All Lockouts</button>
        </div>
        {lockouts.map((l) => (
          <div key={l._id} style={{ padding: 12, border: '1px solid #eee', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div><strong>{l.type}</strong> — {l.key}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{l.reason} — expires: {new Date(l.expiresAt).toLocaleString()}</div>
            </div>
            <div>
              <button className='btn btn-secondary' onClick={() => handleUnlock(l._id)}>Revoke</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
