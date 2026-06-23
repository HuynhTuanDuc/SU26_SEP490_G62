export default function IncidentModal({
    open,
    closeIncidentModal
}) {
    if (!open) return null;
    return (
        <section
            className="modal-bacldrop"
            onClick={closeIncidentModal}
        >

        </section>
    )
}

export function StatusModal({
    open,
    newStatus,
    setNewStatus,
    resolutionNote,
    setResolutionNote,
    handleUpdateStatus,
    setStatusModalOpen
}) {
    if (!open) return null;
    return (
        <section>
            <div className="modal-overlay">
                <div className="modal-content">
                    <h3>Cập nhật trạng thái</h3>

                    <select
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value)}
                    >
                        <option value="open">Open</option>
                        <option value="investigating">Investigating</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>

                    <div style={{ marginTop: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>Ghi chú giải quyết (Resolution Note)</label>
                        <textarea
                            value={resolutionNote}
                            onChange={(e) => setResolutionNote(e.target.value)}
                            rows={3}
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                            placeholder="Nhập ghi chú giải quyết sự cố..."
                        />
                    </div>

                    <div className="modal-actions">
                        <button
                            onClick={() => setStatusModalOpen(false)}
                        >
                            Hủy
                        </button>

                        <button
                            onClick={handleUpdateStatus}
                        >
                            Lưu
                        </button>
                    </div>
                </div>
            </div>
        </section>
    )
}

