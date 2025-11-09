const initialState = {
    showTablet: false,
    showCreation: false,
    tabletData: null,
    creationData: null,
};

export default function families(state = initialState, action) {
    const { type, payload } = action;

    switch (type) {
        case 'FAMILIES_TABLET_SHOW':
            return {
                ...state,
                showTablet: true,
                tabletData: payload,
            };
        case 'FAMILIES_TABLET_REFRESH':
            return {
                ...state,
                tabletData: payload,
            };
        case 'FAMILIES_TABLET_HIDE':
            return {
                ...state,
                showTablet: false,
                tabletData: null,
            };
        case 'FAMILIES_CREATION_SHOW':
            return {
                ...state,
                showCreation: true,
                creationData: payload,
            };
        case 'FAMILIES_CREATION_HIDE':
            return {
                ...state,
                showCreation: false,
                creationData: null,
            };
    }

    return state;
}
