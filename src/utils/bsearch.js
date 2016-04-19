class BSearch {

    static _search(array, value, compare) {
        if (array.length === 0) {
            return 0;
        }
        if (compare(value, array[0]) < 0) {
            return 0;
        }
        if (compare(value, array[array.length - 1]) >= 0) {
            return array.length;
        }

        let mid = 0;
        let low = 0;
        let high = array.length;

        while (low < high) {
            mid = Math.floor((low + high) / 2);
            let cmp = compare(array[mid], value);
            if (cmp < 0) {
                low = mid + 1;
            } else if (cmp > 0) {
                high = mid;
            } else {
                return mid;
            }
        }
        return low;
    }

    static insert(array, value, compare) {
        if (value == undefined) {
            return -1;
        }
        if (compare == undefined) {
            compare = BSearch.less;
        }
        let idx = BSearch._search(array, value, compare);
        array.splice(idx, 0, value);
        return idx;
    }

    static less(a, b) {
        return a - b;
    }

    static greater(a, b) {
        return a - b;
    }

}

export default BSearch;