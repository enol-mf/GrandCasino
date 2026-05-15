import { useState, useEffect } from 'react';
import { api } from '../api/client';

// ─── Promo Codes tab ────────────────────────────────────────────────────────

function CodesTab() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ code: '', reward_chips: '', max_uses: '1', expires_at: '' });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const load = async () => {
    try {
      setCodes(await api.get('/admin/promo'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    try {
      await api.post('/admin/promo', {
        code: form.code.trim(),
        reward_chips: parseInt(form.reward_chips),
        max_uses: parseInt(form.max_uses),
        expires_at: form.expires_at || null,
      });
      setFormSuccess(`Código "${form.code}" creado.`);
      setForm({ code: '', reward_chips: '', max_uses: '1', expires_at: '' });
      load();
    } catch (err) {
      setFormError(err.message);
    }
  };

  const handleToggle = async (id) => {
    try { await api.patch(`/admin/promo/${id}/toggle`); load(); }
    catch (err) { setError(err.message); }
  };

  const handleDelete = async (id, code) => {
    if (!confirm(`¿Eliminar el código "${code}"?`)) return;
    try { await api.delete(`/admin/promo/${id}`); load(); }
    catch (err) { setError(err.message); }
  };

  return (
    <>
      <div className="admin-card">
        <h2>Nuevo código</h2>
        <form className="admin-form" onSubmit={handleCreate}>
          <div className="form-row">
            <div className="form-group">
              <label>Código</label>
              <input type="text" value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                required maxLength={64} placeholder="VERANO2025" />
            </div>
            <div className="form-group">
              <label>Fichas</label>
              <input type="number" min="1" value={form.reward_chips}
                onChange={e => setForm(f => ({ ...f, reward_chips: e.target.value }))}
                required placeholder="500" />
            </div>
            <div className="form-group">
              <label>Usos máx. (0 = ilimitado)</label>
              <input type="number" min="0" value={form.max_uses}
                onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                required />
            </div>
            <div className="form-group">
              <label>Expira (opcional)</label>
              <input type="datetime-local" value={form.expires_at}
                onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
            </div>
          </div>
          {formError && <div className="error-msg">{formError}</div>}
          {formSuccess && <div className="success-msg">{formSuccess}</div>}
          <button type="submit" className="btn btn-primary">Crear código</button>
        </form>
      </div>

      <div className="admin-card">
        <h2>Todos los códigos</h2>
        {error && <div className="error-msg">{error}</div>}
        {loading ? <div className="loading-text">Cargando...</div> : (
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Código</th><th>Fichas</th><th>Usos</th><th>Máx.</th>
                  <th>Expira</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {codes.map(c => (
                  <tr key={c.id} className={!c.active ? 'row-inactive' : ''}>
                    <td><code>{c.code}</code></td>
                    <td>{c.reward_chips.toLocaleString()}</td>
                    <td>{c.uses_count}</td>
                    <td>{c.max_uses === 0 ? 'ilim.' : c.max_uses}</td>
                    <td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString('es') : '—'}</td>
                    <td>
                      <span className={`badge ${c.active ? 'badge-green' : 'badge-red'}`}>
                        {c.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="actions">
                      <button className="btn btn-sm btn-outline" onClick={() => handleToggle(c.id)}>
                        {c.active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id, c.code)}>
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
                {codes.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', opacity: 0.5 }}>Sin códigos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Users tab ──────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState({}); // id → new balance string

  const load = async () => {
    try {
      setUsers(await api.get('/admin/users'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveBalance = async (id) => {
    const val = parseInt(editing[id]);
    if (!Number.isInteger(val) || val < 0) return;
    try {
      const updated = await api.patch(`/admin/users/${id}/balance`, { balance: val });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, balance: updated.balance } : u));
      setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="admin-card">
      <h2>Jugadores</h2>
      {error && <div className="error-msg">{error}</div>}
      {loading ? <div className="loading-text">Cargando...</div> : (
        <div className="table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuario</th><th>Fichas</th><th>Rol</th><th>Registro</th><th>Ajustar saldo</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.username}</strong></td>
                  <td className="gold">{u.balance.toLocaleString()}</td>
                  <td>
                    <span className={`badge ${u.is_admin ? 'badge-green' : 'badge-red'}`}>
                      {u.is_admin ? 'Admin' : 'Usuario'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    {new Date(u.created_at).toLocaleDateString('es')}
                  </td>
                  <td>
                    <div className="actions">
                      <input
                        type="number" min="0"
                        className="bet-input"
                        style={{ width: 90 }}
                        value={editing[u.id] ?? u.balance}
                        onChange={e => setEditing(prev => ({ ...prev, [u.id]: e.target.value }))}
                      />
                      {editing[u.id] !== undefined && (
                        <button className="btn btn-sm btn-primary" onClick={() => saveBalance(u.id)}>
                          Guardar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Admin page with tabs ───────────────────────────────────────────────────

export default function Admin() {
  const [tab, setTab] = useState('codes');

  return (
    <div className="admin-page">
      <h1>Panel de administración</h1>

      <div className="admin-tabs">
        <button
          className={`admin-tab ${tab === 'codes' ? 'admin-tab-active' : ''}`}
          onClick={() => setTab('codes')}
        >
          Códigos promocionales
        </button>
        <button
          className={`admin-tab ${tab === 'users' ? 'admin-tab-active' : ''}`}
          onClick={() => setTab('users')}
        >
          Jugadores
        </button>
      </div>

      {tab === 'codes' && <CodesTab />}
      {tab === 'users' && <UsersTab />}
    </div>
  );
}
