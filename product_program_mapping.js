import { LightningElement, api, track, wire } from 'lwc';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import PRODUCT_PROGRAM_MAPPING from '@salesforce/schema/Product_Program_Mapping__c';
import NAME_FIELD from '@salesforce/schema/Product_Program_Mapping__c.Name';
import PRICE_FIELD from '@salesforce/schema/Product_Program_Mapping__c.Price__c'; // Change to actual API name if custom
import CURRENT_SOB_FIELD from '@salesforce/schema/Product_Program_Mapping__c.Current_SOB__c'; // Change to actual API name if custom
import getProductData from '@salesforce/apex/ProductProgramMappingController.getStandardPricebookProducts';
import getExistingMappings from '@salesforce/apex/ProductProgramMappingController.getExistingMappings';
import getProductPicklistValues from '@salesforce/apex/ProductProgramMappingController.getProductPicklistValues';
import saveProductProgramMappings from '@salesforce/apex/ProductProgramMappingController.saveProductProgramMappings';
import { CloseActionScreenEvent } from 'lightning/actions';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';


export default class ProductProgramMapping extends LightningElement {
    @api recordId;
    @track products = [];
    @track allProducts = [];
    @track searchTerm = '';
    @track selectedPower = [];
    @track selectedSegment = [];
    @track tempPower = [];
    @track tempSegment = [];
    @track powerOptions = [];
    @track segmentOptions = [];
    @track showFilterModal = false;
    @track isLoading = true;
     
    // Dynamic field labels
    nameLabel = 'Product';
    priceLabel = 'Price';
    currentSOBLabel = 'Current SOB';

    // Dynamic financial years
    @track financialYears = [];
    baseFYStart = null; // Used for reset logic
@track isFullScreen = false;
@track fullScreenLabel;
@track isFullScreenClass;
@track containerClass = 'slds-modal__content slds-p-around_medium container details';
    @wire(getObjectInfo, { objectApiName: PRODUCT_PROGRAM_MAPPING })
    objectInfo({ data, error }) {
        if (data) {
            this.nameLabel = data.fields[NAME_FIELD.fieldApiName]?.label || 'Product';
            this.priceLabel = data.fields[PRICE_FIELD.fieldApiName]?.label || 'Price';
            this.currentSOBLabel = data.fields[CURRENT_SOB_FIELD.fieldApiName]?.label || 'Current SOB';

            // Dynamically determine year fields (exclude name, price, currentSOB, and system fields)
            this.yearFields = Object.keys(data.fields)
                .filter(f => ![NAME_FIELD.fieldApiName, PRICE_FIELD.fieldApiName, CURRENT_SOB_FIELD.fieldApiName, 'Id', 'Name', 'OwnerId', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById', 'SystemModstamp', 'LastActivityDate'].includes(f))
                .filter(f => data.fields[f].dataType === 'Double' || data.fields[f].dataType === 'Integer')
                .map(f => f);
            this.yearFieldLabels = {};
            this.yearFields.forEach(f => {
                this.yearFieldLabels[f] = data.fields[f].label;
            });
        } else if (error) {
            // fallback to default labels
        }
    }

      handleToggleFullScreen() {
          console.log('result ', this.isFullScreen);
          this.isFullScreen = !this.isFullScreen;
         // this.fullScreenLabel = isFullScreen ? 'Exit Fullscreen' : 'Fullscreen';
          this.isFullScreenClass = `${this.isFullScreen ? 'slds-modal slds-fade-in-open container fullscreen' : ''}`
          console.log('result ', this.isFullScreen);
        this.containerClass = `${this.isFullScreen ? 'slds-modal__content slds-p-around_medium' : 'slds-modal__content slds-p-around_medium container details'}`
    }

    connectedCallback() {
        this.setFinancialYears();
        setTimeout(() => {
            Promise.all([
                getProductData(),
                getExistingMappings({ parentRecordId: this.recordId }),
                getProductPicklistValues()
            ])
                .then(([productList, existingData, picklistMap]) => {
                    const existingMap = new Map();
                    if (existingData.existingMappings) {
                        for (const item of existingData.existingMappings) {
                            existingMap.set(item.name, item);
                        }
                    }

                    const powerSet = new Set();
                    const segmentSet = new Set();

                    const mappedProducts = productList.map(prod => {
                        const existing = existingMap.get(prod.Name);

                        const yearData = this.financialYears.map(fy => {
                            const fyExisting = existing?.yearData?.find(y => y.yearId === fy.id) || {};
                            // Build year fields dynamically
                            const yearFieldsObj = { yearId: fy.id, fyId: fyExisting.fyId || null };
                            this.yearFields.forEach(field => {
                                yearFieldsObj[field] = fyExisting[field] || '';
                            });
                            return yearFieldsObj;
                        });

                        return {
                            id: prod.Id,
                            name: prod.Name,
                            price: existing?.price || 0,
                            currentSOB: existing?.currentSOB || '',
                            ppmId: existing?.id || null,
                            yearData,
                            selected: !!existing,
                            power: prod.Power__c || '',
                            segment: prod.Segment__c || ''
                        };
                    });

                    this.powerOptions = 
                        picklistMap.power.map(p => ({ label: p, value: p }));

                    this.segmentOptions = 
                        picklistMap.segment.map(s => ({ label: s, value: s }));

                    this.allProducts = mappedProducts;
                    this.products = [...this.allProducts];
                })
                .catch(error => {
                    console.error('Error loading product data or mappings:', error);
                })
                .finally(() => {
                    this.isLoading = false;
                });
        }, 200);
    }

    setFinancialYears(startFY) {
        // Determine current FY if not provided
        let today = new Date();
        let year = today.getFullYear();
        let month = today.getMonth() + 1; // 0-indexed
        let fyStart;
        if (month >= 4) {
            fyStart = year;
        } else {
            fyStart = year - 1;
        }
        if (startFY) {
            fyStart = startFY;
        }
        this.baseFYStart = fyStart;
        this.financialYears = Array.from({ length: 5 }, (_, i) => {
            const start = fyStart + i;
            const end = (start + 1).toString().slice(-2);
            return {
                id: `${start}-${end}`,
                label: `${start}-${end}`,
                headerKey: `header_${start}`,
                appKey: `app_${start}`,
                servKey: `serv_${start}`,
                sobKey: `sob_${start}`
            };
        });
    }

    handleResetYear() {
        // Move to next FY
        this.setFinancialYears(this.baseFYStart + 1);
        // Re-map yearData for products
        this.products = this.products.map(prod => {
            const yearData = this.financialYears.map(fy => {
                // Try to find matching yearData from previous years
                const prev = prod.yearData?.find(y => y.yearId === fy.id) || {};
                const yearFieldsObj = { yearId: fy.id, fyId: prev.fyId || null };
                this.yearFields.forEach(field => {
                    yearFieldsObj[field] = prev[field] || '';
                });
                return yearFieldsObj;
            });
            return { ...prod, yearData };
        });
    }

   

    handleSearch(event) {
        this.searchTerm = event.target.value.toLowerCase();
        this.filterProducts();
    }

    filterProducts() {
        this.products = this.allProducts.filter(p => {
            const matchesSearch = p.name?.toLowerCase().includes(this.searchTerm);
            const matchesPower = this.selectedPower.length === 0 || this.selectedPower.includes(p.power);
            const matchesSegment = this.selectedSegment.length === 0 || this.selectedSegment.includes(p.segment);
            return matchesSearch && matchesPower && matchesSegment;
        });
    }

    toggleFilterModal() {
        this.tempPower = [...this.selectedPower];
        this.tempSegment = [...this.selectedSegment];
        this.showFilterModal = true;
    }

    handleFilterCancel() {
        this.showFilterModal = false;
    }

    handleFilterDone() {
        this.selectedPower = [...this.tempPower];
        this.selectedSegment = [...this.tempSegment];
        this.showFilterModal = false;
        this.filterProducts();
    }

    handleTempPowerChange(event) {
        this.tempPower = event.detail.value;
    }

    handleTempSegmentChange(event) {
        this.tempSegment = event.detail.value;
    }

    handleSelection(event) {
        const id = event.target.dataset.productid;
        const selected = event.target.checked;
        this.products = this.products.map(prod => {
            if (prod.id === id) {
                return { ...prod, selected };
            }
            return prod;
        });
    }

    handleInputChange(event) {
        const { productid, year, field } = event.target.dataset;
        const value = event.target.value;
        console.log('153 value ', value + '%');
        

        this.products = this.products.map(prod => {
            if (prod.id === productid) {
                if (field === 'price' || field === 'currentSOB') {
                    return { ...prod, [field]: value };
                } else {
                    const updatedYearData = prod.yearData.map(y => {
                        if (y.yearId === year) {
                            return { ...y, [field]: value };
                        }
                        return y;
                    });
                    return { ...prod, yearData: updatedYearData };
                }
            }
            return prod;
        });
    }

    handleSubmit() {
        const selectedProducts = this.products.filter(p => p.selected);

        if (selectedProducts.length === 0) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'No Products Selected',
                message: 'Please select at least one product to proceed.',
                variant: 'warning'
            }));
            return;
        }

        const payload = selectedProducts.map(prod => ({
            name: prod.name,
            price: prod.price,
            currentSOB: prod.currentSOB,
            id: (prod.ppmId && prod.ppmId.length === 18) ? prod.ppmId : null,
            yearData: prod.yearData.map(y => {
                const yd = { yearId: y.yearId, fyId: (y.fyId && y.fyId.length === 18) ? y.fyId : null };
                this.yearFields.forEach(field => {
                    yd[field] = y[field];
                });
                return yd;
            })
        }));

        saveProductProgramMappings({ jsonString: JSON.stringify(payload), parentRecordId: this.recordId })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Success',
                    message: 'Product Program Mappings saved successfully!',
                    variant: 'success'
                }));
                this.dispatchEvent(new CloseActionScreenEvent());
            })
            .catch(error => {
                console.error('Error saving:', error);
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Error',
                    message: 'An error occurred while saving data.',
                    variant: 'error'
                }));
            });
    }

    handleCancel() {
        this.dispatchEvent(new CloseActionScreenEvent());
    }
}