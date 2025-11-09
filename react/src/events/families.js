export default (emitter, dispatch, getState) => {
    const updateVisibility = () => {
        const state = getState();
        const show = state.families.showTablet || state.families.showCreation;
        dispatch({ type: 'SHOW_FAMILIES', payload: show });
    };

    emitter.on('families.open', (payload) => {
        dispatch({ type: 'FAMILIES_TABLET_SHOW', payload });
        updateVisibility();
    });

    emitter.on('families.refresh', (payload) => {
        dispatch({ type: 'FAMILIES_TABLET_REFRESH', payload });
    });

    emitter.on('families.close', () => {
        dispatch({ type: 'FAMILIES_TABLET_HIDE' });
        updateVisibility();
    });

    emitter.on('families.creation.open', (payload) => {
        dispatch({ type: 'FAMILIES_CREATION_SHOW', payload });
        updateVisibility();
    });

    emitter.on('families.creation.close', () => {
        dispatch({ type: 'FAMILIES_CREATION_HIDE' });
        updateVisibility();
    });
};
