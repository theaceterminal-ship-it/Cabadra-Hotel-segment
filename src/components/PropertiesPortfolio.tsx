import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Property } from '../types';
import { AddPropertyFlow } from './AddPropertyFlow';
import { SETUP_FEE_INR, type Organization } from '../lib/setupPayment';
import {
  Search,
  Plus,
  MapPin,
  Building,
  X
} from 'lucide-react';

interface PropertiesPortfolioProps {
  properties: Property[];
  onSelectProperty: (propertyId: string) => void;
  organization: Organization | null;
  onOrganizationSaved: (org: Organization) => void;
  /** Runs after a new property's setup fee is paid and the property exists. Rooms aren't created here yet; that's a separate step, on the property's own detail page. */
  onPropertyCreated: (propertyId: string) => Promise<void>;
  email?: string;
}

export const PropertiesPortfolio: React.FC<PropertiesPortfolioProps> = ({
  properties,
  onSelectProperty,
  organization,
  onOrganizationSaved,
  onPropertyCreated,
  email,
}) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'maintenance'>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // The Overview page's "Add property" button lands here with ?add=1 so the
  // setup form opens straight away; the flag is dropped so a refresh or the
  // back button doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setShowAddModal(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const filteredProperties = properties.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleCreated = async (propertyId: string) => {
    setShowAddModal(false);
    await onPropertyCreated(propertyId);
  };

  return (
    <div id="properties-portfolio-canvas" className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pt-4">
          <div>
            <h1 className="text-[32px] sm:text-[40px] leading-tight font-semibold tracking-[-0.03em] text-on-surface">Properties</h1>
            <p className="text-sm text-on-surface-variant mt-1">Each property keeps its own rooms, menu, staff and settings.</p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="input-search-properties"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search properties..."
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-outline-variant bg-surface-container-lowest text-xs text-on-surface placeholder-outline focus:border-primary focus:outline-none shadow-2xs"
              />
            </div>

            {/* Status Filter */}
            <div className="flex bg-surface-container-low p-1 rounded-lg border border-outline-variant text-xs">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  filterStatus === 'all' ? 'bg-surface-container-lowest text-primary shadow-xs font-semibold' : 'text-on-surface-variant'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus('active')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  filterStatus === 'active' ? 'bg-surface-container-lowest text-primary shadow-xs font-semibold' : 'text-on-surface-variant'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setFilterStatus('maintenance')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  filterStatus === 'maintenance' ? 'bg-surface-container-lowest text-primary shadow-xs font-semibold' : 'text-on-surface-variant'
                }`}
              >
                Maintenance
              </button>
            </div>

            {/* Add New Property Button */}
            <button
              id="btn-add-new-property"
              onClick={() => setShowAddModal(true)}
              className="h-11 px-5 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Add property</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bento Grid of Properties */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredProperties.map((prop) => {
          const isMaint = prop.status === 'maintenance';
          return (
            <div
              key={prop.id}
              id={`property-card-${prop.id}`}
              className={`bg-surface-container-lowest rounded-xl border ${
                isMaint ? 'border-warning' : 'border-outline-variant'
              } shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow relative`}
            >
              {/* Hotel Photo Banner — no image storage modeled yet (see staffApi.ts), so a fresh property has none */}
              <div className="relative h-48 w-full overflow-hidden bg-gray-100">
                {prop.image ? (
                  <img
                    src={prop.image}
                    alt={prop.name}
                    className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${
                      isMaint ? 'grayscale-[15%]' : ''
                    }`}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-surface-container-low text-primary">
                    <Building className="w-10 h-10 opacity-40" />
                  </div>
                )}

                {/* Status Badge */}
                <div className="absolute top-3 right-3 bg-surface-container-lowest/95 backdrop-blur-xs px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-outline-variant">
                  <div className={`w-2 h-2 rounded-full ${isMaint ? 'bg-warning' : 'bg-success'}`}></div>
                  <span className="text-[11px] font-bold text-on-surface uppercase tracking-wider">
                    {prop.status}
                  </span>
                </div>
              </div>

              {/* Card Details */}
              <div className="p-6 flex-grow flex flex-col justify-between">
                <div>
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-on-surface truncate">{prop.name}</h3>
                    <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-on-surface-variant" />
                      <span>{prop.location}</span>
                    </p>
                  </div>

                  {/* 3 Metric Sub-cards */}
                  <div className="grid grid-cols-3 gap-2 mb-6">
                    <div className="bg-surface-container-low rounded-lg p-3 flex flex-col justify-center items-center text-center">
                      <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider block mb-1">
                        Occupancy
                      </span>
                      <span className="text-base font-bold text-on-surface">
                        {prop.occupancy}%
                      </span>
                    </div>

                    <div className="bg-surface-container-low rounded-lg p-3 flex flex-col justify-center items-center text-center">
                      <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider block mb-1">
                        Rev (Today)
                      </span>
                      <span className="text-base font-bold text-on-surface">
                        {prop.revenueToday}
                      </span>
                    </div>

                    <div className="bg-surface-container-low rounded-lg p-3 flex flex-col justify-center items-center text-center">
                      <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider block mb-1">
                        Requests
                      </span>
                      <span className={`text-base font-bold ${prop.requestsCount > 10 ? 'text-warning' : 'text-on-surface'}`}>
                        {prop.requestsCount}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Manage — the whole property console (overview, rooms, menu, staff) lives on its own page, not a popup */}
                <button
                  id={`btn-manage-property-${prop.id}`}
                  onClick={() => {
                    onSelectProperty(prop.id);
                    navigate(`/owner/properties/${prop.id}`);
                  }}
                  className="w-full h-11 rounded-full bg-primary text-on-primary font-medium text-sm hover:bg-primary-hover transition-colors cursor-pointer"
                >
                  Manage Property
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add New Property Modal */}
      {showAddModal && (
        <div 
          id="modal-add-property"
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
        >
          <div className="bg-surface-container-lowest rounded-[32px] max-w-lg w-full max-h-[calc(100svh-2rem)] overflow-y-auto p-6 sm:p-8 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold tracking-[-0.02em] text-on-surface">
                  {organization ? 'Add a property' : 'Your business details'}
                </h3>
                <p className="text-sm text-on-surface-variant mt-1">
                  {organization
                    ? `One-time setup fee of ₹${SETUP_FEE_INR.toLocaleString('en-IN')} for this property.`
                    : 'Needed once, before your next property.'}
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="size-10 shrink-0 rounded-full border border-outline-variant flex items-center justify-center text-on-surface hover:bg-surface-container-low"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-6">
              <AddPropertyFlow
                organization={organization}
                onOrganizationSaved={onOrganizationSaved}
                onCreated={handleCreated}
                onCancel={() => setShowAddModal(false)}
                email={email}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
