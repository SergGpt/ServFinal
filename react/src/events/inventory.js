export default (myEventEmmiter, dispatch) => {
    myEventEmmiter.on('inventory.show', (flag) => {
        dispatch({
            type: flag ? 'SHOW_INVENTORY' : 'HIDE_INVENTORY',
        });
    });

    myEventEmmiter.on('inventory.state', (state) => {
        dispatch({
            type: 'INVENTORY_SET_STATE',
            payload: state,
        });
    });

    myEventEmmiter.on('inventory.weight', (weight) => {
        dispatch({
            type: 'INVENTORY_SET_WEIGHT',
            payload: weight,
        });
    });
};
