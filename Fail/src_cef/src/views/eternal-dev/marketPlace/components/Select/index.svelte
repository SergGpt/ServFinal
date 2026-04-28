<script>
    import './style.scss'

    export let icon;
    export let defaultText;
    export let options;
    export let onClick;
    export let current;
    export let canClear = true;

    let opened = false;
    let value = defaultText;

    let container;
    let input;

    let isSelected = false;
    $: isSelected = current != null;

    const setVisible = (state) => {
        opened = state;
        value = isSelected ? options[current].label : opened ? "" : defaultText;

        if (input)
            opened ? input.focus() : input.blur();
    }

    const selectOption = (type) => {
        setVisible(false);
        onClick(type);
    };

    const Icons = {
        "categories": `
            <svg
                id="all-svgrepo-com"
                xmlns="http://www.w3.org/2000/svg"
                width="1.2075925925925926vh"
                height="1.2962962962962963vh"
                viewBox="0 0 13.042 14"
            >
                <path
                    id="Контур_6051"
                    data-name="Контур 6051"
                    d="M10.474,6.458a.649.649,0,0,1-.644-.644V1.747a.649.649,0,0,1,.644-.644h4.155a.649.649,0,0,1,.644.644V5.814a.649.649,0,0,1-.644.644Z"
                    transform="translate(-2.311 -0.752)"
                    fill="#101010"
                ></path>
                <path
                    id="Контур_6052"
                    data-name="Контур 6052"
                    d="M12.248,9.946l-2.4,2.6a.407.407,0,0,0,0,.556l2.4,2.6a.391.391,0,0,0,.585,0l2.4-2.6a.407.407,0,0,0,0-.556l-2.4-2.6A.391.391,0,0,0,12.248,9.946Z"
                    transform="translate(-2.3 -1.841)"
                    fill="#101010"
                ></path>
                <circle
                    id="Эллипс_4"
                    data-name="Эллипс 4"
                    cx="2.721"
                    cy="2.721"
                    r="2.721"
                    transform="translate(0 8.192)"
                    fill="#101010"
                ></circle>
                <path
                    id="Контур_6053"
                    data-name="Контур 6053"
                    d="M1.559,1.99,3.666.79a.581.581,0,0,1,.614,0l2.077,1.2a.627.627,0,0,1,.322.556v2.4a.627.627,0,0,1-.322.556L4.28,6.7a.581.581,0,0,1-.614,0L1.559,5.5a.627.627,0,0,1-.322-.556v-2.4A.627.627,0,0,1,1.559,1.99Z"
                    transform="translate(-1.237 -0.702)"
                    fill="#101010"
                ></path>
            </svg>
        `,

        "sort": `
            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="0.8641666666666666vh" viewBox="0 0 14 9.333">
                <g id="sort" transform="translate(0 -2.333)">
                    <g id="Сгруппировать_3505" data-name="Сгруппировать 3505">
                        <g id="Сгруппировать_3504" data-name="Сгруппировать 3504">
                            <rect id="Прямоугольник_4889" data-name="Прямоугольник 4889" width="4.667" height="1.556" transform="translate(0 10.111)" fill="#101010"></rect>
                            <rect id="Прямоугольник_4890" data-name="Прямоугольник 4890" width="9.333" height="1.556" transform="translate(0 6.222)" fill="#101010"></rect>
                            <rect id="Прямоугольник_4891" data-name="Прямоугольник 4891" width="14" height="1.556" transform="translate(0 2.333)" fill="#101010"></rect>
                        </g>
                    </g>
                </g>
            </svg>
        `,

        "time": `
            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14">
                <g id="calendar_1_" data-name="calendar (1)" transform="translate(-1.4 -1.4)">
                    <path id="Контур_12572" data-name="Контур 12572" d="M14.7,2.8H13.3V1.4H11.9V2.8h-7V1.4H3.5V2.8H2.1a.661.661,0,0,0-.7.7V14.7a.661.661,0,0,0,.7.7H14.7a.661.661,0,0,0,.7-.7V3.5A.661.661,0,0,0,14.7,2.8ZM14,14H2.8V5.6H14Z" fill="#101010"></path>
                    <path id="Контур_12573" data-name="Контур 12573" d="M4.9,10.5H6.3v1.4H4.9Z" fill="#101010"></path>
                    <path id="Контур_12574" data-name="Контур 12574" d="M7.7,10.5H9.1v1.4H7.7Z" fill="#101010"></path>
                    <path id="Контур_12575" data-name="Контур 12575" d="M10.5,10.5h1.4v1.4H10.5Z" fill="#101010"></path>
                    <path id="Контур_12576" data-name="Контур 12576" d="M4.9,7.7H6.3V9.1H4.9Z" fill="#101010"></path>
                    <path id="Контур_12577" data-name="Контур 12577" d="M7.7,7.7H9.1V9.1H7.7Z" fill="#101010"></path>
                    <path id="Контур_12578" data-name="Контур 12578" d="M10.5,7.7h1.4V9.1H10.5Z" fill="#101010"></path>
                </g>
            </svg>
        `,

        "gender": `
            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.0191666666666666vh" viewBox="0 0 14 11.007">
                <g id="gender" transform="translate(0 -1.497)">
                    <path id="Контур_12716" data-name="Контур 12716" d="M3.691,1.527A3.692,3.692,0,0,0,2.96,8.837V9.982H2.495a.727.727,0,1,0,0,1.453H2.96v.311a.727.727,0,0,0,1.453,0v-.311h.477a.727.727,0,1,0,0-1.453H4.413V8.84a3.692,3.692,0,0,0-.721-7.313ZM5.93,5.218A2.239,2.239,0,1,1,3.692,2.98,2.239,2.239,0,0,1,5.93,5.218Z" fill="#101010"></path>
                    <path id="Контур_12717" data-name="Контур 12717" d="M12.92,6.2a3.664,3.664,0,0,0-1.866-1V3.925l.051.051a.727.727,0,1,0,1.028-1.028L10.922,1.738a.826.826,0,0,0-1.166,0L8.443,3.05A.727.727,0,1,0,9.47,4.078L9.6,3.947V5.19A3.691,3.691,0,1,0,12.92,6.2ZM11.893,10.4a2.238,2.238,0,1,1,0-3.166A2.238,2.238,0,0,1,11.893,10.4Z" fill="#101010"></path>
                </g>
            </svg>
        `
    }
</script>

<svelte:window on:click={(e) => {
    if (container && container.contains(e.target))
        return;

    setVisible(false);
}} />

<div bind:this={container} class="store-select select-type" class:selected={isSelected}>
    <button class="store-select__input" on:click={() => setVisible(!opened)}>
        <div class="store-select__input__icon">
            {@html Icons[icon]}
        </div>
        <input bind:value={value} readonly={isSelected}/>
        <div class="store-select__input__arrow">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13.061 7.591" > <path id="Контур_6054" data-name="Контур 6054" d="M742.37,75.219l6,6,3.5-3.5,2.5-2.5" transform="translate(-741.84 -74.688)" fill="none" stroke="#101010" stroke-width="1.5" opacity="0.5" ></path> </svg>
        </div>
    </button>
    {#if opened}
        <div class="store-select__options">
            {#if isSelected && canClear}
                <button on:click={() => selectOption(null)} class="store-select__options__row">
                    <div class="icon"></div>
                    <span class="highlighted">Сбросить фильтр</span>
                </button>
            {/if}

            {#each Object.entries(options) as [type, item], index}
                <button on:click={() => selectOption(type)} class="store-select__options__row">
                    <div class="icon">{item.icon || ''}</div>
                    <span class="">{item.label}</span>
                </button>
            {/each}
        </div>
    {/if}
</div>
