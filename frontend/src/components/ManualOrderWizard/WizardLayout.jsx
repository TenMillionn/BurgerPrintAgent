import React from 'react';
import { useOrder } from './OrderContext';
import ItemsStep from './ItemsStep';
import Step2ShippingInfo from './Step2ShippingInfo';
import Step3CostCalculation from './Step3CostCalculation';
import { X } from 'lucide-react';

const WizardLayout = ({ onClose }) => {
  const { currentStep } = useOrder();

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <ItemsStep />;
      case 2:
        return <Step2ShippingInfo />;
      case 3:
        return <Step3CostCalculation onClose={onClose} />;
      default:
        return <ItemsStep />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            Create Manual Order
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={24} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between max-w-md mx-auto">
            {[1, 2, 3].map((step) => (
              <React.Fragment key={step}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors
                      ${
                        currentStep >= step
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                  >
                    {step}
                  </div>
                  <span className="text-xs mt-1 text-gray-500 dark:text-gray-400 hidden sm:block">
                    {step === 1 ? 'Product' : step === 2 ? 'Shipping' : 'Review'}
                  </span>
                </div>
                {step < 3 && (
                  <div
                    className={`flex-1 h-1 mx-2 rounded transition-colors ${
                      currentStep > step
                        ? 'bg-blue-600'
                        : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {renderStep()}
        </div>
      </div>
    </div>
  );
};

export default WizardLayout;
