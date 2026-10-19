import addAll from 'rdf-dataset-ext/addAll.js';
import deleteMatch from 'rdf-dataset-ext/deleteMatch.js';
import equals from 'rdf-dataset-ext/equals.js';
export default (createConstructor) => class {
    dataset;
    init() {
        const Dataset = createConstructor(this);
        this.dataset = ((quads = []) => {
            return new Dataset([...quads]);
        });
        this.dataset.Class = Dataset;
        this.dataset.addAll = addAll;
        this.dataset.deleteMatch = deleteMatch;
        this.dataset.equals = equals;
    }
};
