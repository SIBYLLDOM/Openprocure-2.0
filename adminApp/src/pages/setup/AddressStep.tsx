import { useState } from 'react';
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react';
import { Button, Input, PhoneInput, Select, SearchableSelect, Modal, EmptyState, Badge } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import * as setupApi from '../../services/setupProfileApi';
import { countryOptions, INDIA_STATES, INDIA_CITIES } from '../../data/geo';
import type { PartnerProfileData, Address, PartnerLocation } from '../../types/setupProfile';

const LOCATION_TYPES = [
  { value: 'head_office', label: 'Head Office' },
  { value: 'branch', label: 'Branch' },
  { value: 'manufacturing_unit', label: 'Manufacturing Unit' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'service_center', label: 'Service Center' },
  { value: 'other', label: 'Other' },
];
const indiaStateOptions = INDIA_STATES.map((s) => ({ value: s, label: s }));
const isIndia = (country?: string | null) => (country || '').trim().toLowerCase() === 'india';
// Every pincode field across this step: digits only, capped at 6 — matches
// the Indian PIN code format used throughout the wizard.
const sixDigits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
const pincodeError = (v: string) => (v && v.length !== 6 ? 'Pincode must be exactly 6 digits' : undefined);

// No explicit Save button — text fields persist on blur, and dropdown
// selections (which have no blur-to-commit moment) persist the instant
// they're picked, via `onPersist`.
const AddressFields = ({ value, onChange, onPersist }: { value: Address; onChange: (v: Address) => void; onPersist: (next: Address) => void }) => {
  const set = (k: keyof Address, v: string) => onChange({ ...value, [k]: v });
  const india = isIndia(value.country);
  const cityOptions = (INDIA_CITIES[value.state || ''] || []).map((c) => ({ value: c, label: c }));

  const selectAndPersist = (patch: Partial<Address>) => {
    const next = { ...value, ...patch };
    onChange(next);
    onPersist(next);
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <Input label="Address Line 1" placeholder="Street, building, unit no." value={value.line1 || ''} onChange={(e) => set('line1', e.target.value)} onBlur={() => onPersist(value)} wrapperClassName="col-span-2" />
      <Input label="Address Line 2" placeholder="Area, locality (optional)" value={value.line2 || ''} onChange={(e) => set('line2', e.target.value)} onBlur={() => onPersist(value)} wrapperClassName="col-span-2" />

      <SearchableSelect
        label="Country" placeholder="Select country…" searchPlaceholder="Search country…"
        value={value.country || ''} options={countryOptions}
        onChange={(v) => selectAndPersist({ country: v, state: '', city: '' })}
      />

      {india ? (
        <SearchableSelect
          label="State" placeholder="Select state…" searchPlaceholder="Search state…"
          value={value.state || ''} options={indiaStateOptions}
          onChange={(v) => selectAndPersist({ state: v, city: '' })}
        />
      ) : (
        <Input label="State" placeholder="State / province" value={value.state || ''} onChange={(e) => set('state', e.target.value)} onBlur={() => onPersist(value)} />
      )}

      {india && cityOptions.length > 0 ? (
        <SearchableSelect
          label="City" placeholder="Select city…" searchPlaceholder="Search city…" allowCreate
          value={value.city || ''} options={cityOptions}
          onChange={(v) => selectAndPersist({ city: v })}
        />
      ) : (
        <Input label="City" placeholder="e.g. Mumbai" value={value.city || ''} onChange={(e) => set('city', e.target.value)} onBlur={() => onPersist(value)} />
      )}
      <Input label="District" placeholder="e.g. Mumbai Suburban" value={value.district || ''} onChange={(e) => set('district', e.target.value)} onBlur={() => onPersist(value)} />
      <Input
        label="Pincode" placeholder="6-digit PIN code" inputMode="numeric" maxLength={6}
        value={value.pincode || ''} onChange={(e) => set('pincode', sixDigits(e.target.value))} onBlur={() => onPersist(value)}
        error={pincodeError(value.pincode || '')}
      />
      <Input label="Landmark" placeholder="Nearby landmark (optional)" value={value.landmark || ''} onChange={(e) => set('landmark', e.target.value)} onBlur={() => onPersist(value)} />
    </div>
  );
};

const emptyLocation = { name: '', locationType: 'branch', addressLine1: '', addressLine2: '', country: 'India', state: '', city: '', pincode: '', contactPerson: '', phone: '', email: '' };

const AddressStep = ({ profile, onSaved, onRefetch }: { profile: PartnerProfileData; onSaved: (p: PartnerProfileData) => void; onRefetch: () => void }) => {
  const { show } = useToast();
  const [registered, setRegistered] = useState<Address>(profile.registeredAddress || {});
  const [sameAsRegistered, setSameAsRegistered] = useState(profile.sameAsRegistered ?? true);
  const [corporate, setCorporate] = useState<Address>(profile.corporateAddress || {});

  const persistRegistered = (next: Address) => setupApi.saveSection('registeredAddress', next).then(onSaved).catch(() => show('Failed to save.', 'error'));
  const persistCorporate = (next: Address) => setupApi.saveSection('corporateAddress', next).then(onSaved).catch(() => show('Failed to save.', 'error'));
  const toggleSameAsRegistered = (checked: boolean) => {
    setSameAsRegistered(checked);
    setupApi.saveSection('sameAsRegistered', checked).then(onSaved).catch(() => show('Failed to save.', 'error'));
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerLocation | null>(null);
  const [locForm, setLocForm] = useState(emptyLocation);
  const [savingLoc, setSavingLoc] = useState(false);

  const openAdd = () => { setEditing(null); setLocForm(emptyLocation); setModalOpen(true); };
  const openEdit = (l: PartnerLocation) => {
    setEditing(l);
    setLocForm({
      name: l.name || '', locationType: l.locationType || 'branch', addressLine1: l.addressLine1 || '', addressLine2: l.addressLine2 || '',
      country: l.country || 'India', state: l.state || '', city: l.city || '', pincode: l.pincode || '',
      contactPerson: l.contactPerson || '', phone: l.phone || '', email: l.email || '',
    });
    setModalOpen(true);
  };
  const saveLocation = async () => {
    setSavingLoc(true);
    try {
      if (editing) await setupApi.locationsApi.update(editing.id, locForm);
      else await setupApi.locationsApi.create(locForm);
      show('Location saved.', 'success');
      setModalOpen(false);
      onRefetch();
    } catch (err: any) {
      show(err?.response?.data?.message ?? 'Failed to save location.', 'error');
    } finally {
      setSavingLoc(false);
    }
  };
  const removeLocation = async (id: number) => {
    try { await setupApi.locationsApi.remove(id); show('Location removed.', 'success'); onRefetch(); } catch { show('Failed to remove.', 'error'); }
  };

  const locIndia = isIndia(locForm.country);
  const locCityOptions = (INDIA_CITIES[locForm.state] || []).map((c) => ({ value: c, label: c }));

  return (
    <div className="grid lg:grid-cols-2 gap-x-10 gap-y-8">
      {/* Left column — the primary registered address, the thing every partner must fill */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Registered Address</h3>
        <AddressFields value={registered} onChange={setRegistered} onPersist={persistRegistered} />
      </div>

      {/* Right column — secondary, optional panels: corporate office + branch/warehouse locations */}
      <div className="space-y-8 lg:border-l lg:border-gray-100 lg:pl-10">
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Corporate Office</h2>
          <label className="flex items-center gap-2 text-sm text-gray-600 mb-4">
            <input type="checkbox" className="accent-primary-600" checked={sameAsRegistered} onChange={(e) => toggleSameAsRegistered(e.target.checked)} />
            Same as Registered Office
          </label>
          {!sameAsRegistered && <AddressFields value={corporate} onChange={setCorporate} onPersist={persistCorporate} />}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3 gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Manufacturing / Warehouse Locations</h2>
              <p className="text-sm text-gray-500">Add any additional branches, plants, or warehouses.</p>
            </div>
            <Button size="sm" icon={Plus} onClick={openAdd} className="flex-shrink-0">Add Location</Button>
          </div>
          {profile.locations.length === 0 ? (
            <EmptyState icon={MapPin} title="No locations added yet" description="Add manufacturing units, warehouses, or branches if relevant." />
          ) : (
            <div className="space-y-2">
              {profile.locations.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{l.name || 'Unnamed location'} {l.locationType && <Badge status={LOCATION_TYPES.find((t) => t.value === l.locationType)?.label || l.locationType} variant="gray" className="ml-1" />}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{[l.city, l.state, l.country].filter(Boolean).join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(l)} className="p-1.5 text-gray-400 hover:text-primary-600"><Pencil size={14} /></button>
                    <button onClick={() => removeLocation(l.id)} className="p-1.5 text-gray-400 hover:text-danger-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => !savingLoc && setModalOpen(false)} title={editing ? 'Edit Location' : 'Add Location'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={savingLoc}>Cancel</Button><Button loading={savingLoc} onClick={saveLocation}>Save</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Location Name" placeholder="e.g. Pune Warehouse" value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} />
            <Select label="Location Type" value={locForm.locationType} onChange={(e) => setLocForm({ ...locForm, locationType: e.target.value })} options={LOCATION_TYPES} />
          </div>
          <Input label="Address" placeholder="Street, building, unit no." value={locForm.addressLine1} onChange={(e) => setLocForm({ ...locForm, addressLine1: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <SearchableSelect
              label="Country" placeholder="Select country…" searchPlaceholder="Search country…"
              value={locForm.country} options={countryOptions}
              onChange={(v) => setLocForm({ ...locForm, country: v, state: '', city: '' })}
            />
            {locIndia ? (
              <SearchableSelect
                label="State" placeholder="Select state…" searchPlaceholder="Search state…"
                value={locForm.state} options={indiaStateOptions}
                onChange={(v) => setLocForm({ ...locForm, state: v, city: '' })}
              />
            ) : (
              <Input label="State" placeholder="State / province" value={locForm.state} onChange={(e) => setLocForm({ ...locForm, state: e.target.value })} />
            )}
            {locIndia && locCityOptions.length > 0 ? (
              <SearchableSelect
                label="City" placeholder="Select city…" searchPlaceholder="Search city…" allowCreate
                value={locForm.city} options={locCityOptions}
                onChange={(v) => setLocForm({ ...locForm, city: v })}
              />
            ) : (
              <Input label="City" placeholder="e.g. Pune" value={locForm.city} onChange={(e) => setLocForm({ ...locForm, city: e.target.value })} />
            )}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Pincode" placeholder="6-digit PIN code" inputMode="numeric" maxLength={6}
              value={locForm.pincode} onChange={(e) => setLocForm({ ...locForm, pincode: sixDigits(e.target.value) })}
              error={pincodeError(locForm.pincode)}
            />
            <Input label="Contact Person" placeholder="Full name" value={locForm.contactPerson} onChange={(e) => setLocForm({ ...locForm, contactPerson: e.target.value })} />
            <Input label="Email" placeholder="name@company.com" value={locForm.email} onChange={(e) => setLocForm({ ...locForm, email: e.target.value })} />
          </div>
          <PhoneInput label="Phone" value={locForm.phone} onChange={(v) => setLocForm({ ...locForm, phone: v })} wrapperClassName="max-w-[calc(33%-0.5rem)]" />
        </div>
      </Modal>
    </div>
  );
};

export default AddressStep;
