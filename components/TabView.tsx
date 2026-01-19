interface TabViewProps {
  activeTab: 'my-resumes' | 'internal-db';
  onTabChange: (tab: 'my-resumes' | 'internal-db') => void;
}

export default function TabView({ activeTab, onTabChange }: TabViewProps) {
  return (
    <div className="border-b border-gray-200">
      <div className="flex">
        <button
          onClick={() => onTabChange('my-resumes')}
          className={`px-6 py-3 text-sm transition-colors ${
            activeTab === 'my-resumes'
              ? 'text-gray-900 border-b-2 border-gray-800'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          My Resumes
        </button>
        <button
          onClick={() => onTabChange('internal-db')}
          className={`px-6 py-3 text-sm transition-colors ${
            activeTab === 'internal-db'
              ? 'text-gray-900 border-b-2 border-gray-800'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          Internal DB
        </button>
      </div>
    </div>
  );
}
