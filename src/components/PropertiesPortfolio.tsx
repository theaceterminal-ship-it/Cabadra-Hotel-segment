import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Property, AppView } from '../types';
import { NewPropertyForm, NewPropertyInput } from './NewPropertyForm';
import {
  Search,
  Plus,
  MapPin,
  ArrowLeft,
  Building,
  CheckCircle2,
  AlertTriangle,
  SlidersHorizontal,
  X
} from 'lucide-react';

interface PropertiesPortfolioProps {
  properties: Property[];
  onSelectProperty: (propertyId: string) => void;
  onNavigate: (view: AppView) => void;
  /** Creates the property for real (staff_create_property) — throws on failure so the modal can show why. Rooms aren't created here yet; that's a separate step, on the property's own detail page. */
  onAddProperty: (input: NewPropertyInput) => Promise<void>;
}

export const PropertiesPortfolio: React.FC<PropertiesPortfolioProps> = ({
  properties,
  onSelectProperty,
  onNavigate,
  onAddProperty,
}) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'maintenance'>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  const filteredProperties = properties.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleCreateProperty = async (input: NewPropertyInput) => {
    await onAddProperty(input);
    setShowAddModal(false);
  };

  return (
    <div id="properties-portfolio-canvas" className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Back link & Header */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => onNavigate('owner_overview')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#765a25] hover:underline cursor-pointer w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Owner Overview</span>
        </button>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-[#141d23]">Properties</h1>
            <p className="text-sm text-[#4e463a] mt-1">Manage your portfolio across all regions.</p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#7f7668] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="input-search-properties"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search properties..."
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-[#E9ECEF] bg-white text-xs text-[#141d23] placeholder-[#7f7668] focus:border-[#765a25] focus:outline-none shadow-2xs"
              />
            </div>

            {/* Status Filter */}
            <div className="flex bg-[#ecf5fe] p-1 rounded-lg border border-[#E9ECEF] text-xs">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  filterStatus === 'all' ? 'bg-white text-[#765a25] shadow-xs font-semibold' : 'text-[#4e463a]'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus('active')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  filterStatus === 'active' ? 'bg-white text-[#765a25] shadow-xs font-semibold' : 'text-[#4e463a]'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setFilterStatus('maintenance')}
                className={`px-3 py-1.5 rounded font-medium transition-colors ${
                  filterStatus === 'maintenance' ? 'bg-white text-[#765a25] shadow-xs font-semibold' : 'text-[#4e463a]'
                }`}
              >
                Maintenance
              </button>
            </div>

            {/* Add New Property Button */}
            <button
              id="btn-add-new-property"
              onClick={() => setShowAddModal(true)}
              className="h-11 px-4 rounded-lg bg-[#765a25] text-white text-xs font-semibold hover:bg-[#5c4210] transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer whitespace-nowrap w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Property</span>
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
              className={`bg-white rounded-xl border ${
                isMaint ? 'border-[#D4A373]' : 'border-[#E9ECEF]'
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
                  <div className="w-full h-full flex items-center justify-center bg-[#ecf5fe] text-[#765a25]">
                    <Building className="w-10 h-10 opacity-40" />
                  </div>
                )}

                {/* Status Badge */}
                <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-xs px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-[#E9ECEF]">
                  <div className={`w-2 h-2 rounded-full ${isMaint ? 'bg-[#D4A373]' : 'bg-[#2D6A4F]'}`}></div>
                  <span className="text-[11px] font-bold text-[#141d23] uppercase tracking-wider">
                    {prop.status}
                  </span>
                </div>
              </div>

              {/* Card Details */}
              <div className="p-6 flex-grow flex flex-col justify-between">
                <div>
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-[#141d23] truncate">{prop.name}</h3>
                    <p className="text-xs text-[#4e463a] flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-[#7f7668]" />
                      <span>{prop.location}</span>
                    </p>
                  </div>

                  {/* 3 Metric Sub-cards */}
                  <div className="grid grid-cols-3 gap-2 mb-6">
                    <div className="bg-[#ecf5fe] rounded-lg p-3 flex flex-col justify-center items-center text-center">
                      <span className="text-[10px] font-semibold text-[#4e463a] uppercase tracking-wider block mb-1">
                        Occupancy
                      </span>
                      <span className="text-base font-bold text-[#141d23]">
                        {prop.occupancy}%
                      </span>
                    </div>

                    <div className="bg-[#ecf5fe] rounded-lg p-3 flex flex-col justify-center items-center text-center">
                      <span className="text-[10px] font-semibold text-[#4e463a] uppercase tracking-wider block mb-1">
                        Rev (Today)
                      </span>
                      <span className="text-base font-bold text-[#141d23]">
                        {prop.revenueToday}
                      </span>
                    </div>

                    <div className="bg-[#ecf5fe] rounded-lg p-3 flex flex-col justify-center items-center text-center">
                      <span className="text-[10px] font-semibold text-[#4e463a] uppercase tracking-wider block mb-1">
                        Requests
                      </span>
                      <span className={`text-base font-bold ${prop.requestsCount > 10 ? 'text-[#D4A373]' : 'text-[#141d23]'}`}>
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
                  className="w-full h-11 rounded-lg bg-[#765a25] text-white font-semibold text-xs hover:bg-[#5c4210] transition-colors cursor-pointer"
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E9ECEF]">
            <div className="flex items-center justify-between pb-4 border-b border-[#E9ECEF]">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-[#765a25]" />
                <h3 className="font-semibold text-lg text-[#141d23]">Add New Property</h3>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="pt-4">
              <NewPropertyForm onCreate={handleCreateProperty} onCancel={() => setShowAddModal(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
