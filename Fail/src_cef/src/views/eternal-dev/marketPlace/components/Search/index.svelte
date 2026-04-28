<script>
    import "./style.scss";

    export let placeholder;
    export let value;
    export let maxlength;
    export let update;
</script>

<div class="search-input search-businessId" always-display-option-icon="true" default-icon="icons/marketPlace/filterIcons/figures.svg">
    <svg xmlns="http://www.w3.org/2000/svg" width="1.2514814814814814vh" height="1.2962962962962963vh" viewBox="0 0 13.516 14" > <path id="search" d="M13.553,12.752,10.221,9.286A5.65,5.65,0,1,0,5.894,11.3a5.592,5.592,0,0,0,3.238-1.023l3.357,3.492a.737.737,0,1,0,1.063-1.022ZM5.894,1.475A4.178,4.178,0,1,1,1.716,5.652,4.183,4.183,0,0,1,5.894,1.475Z" transform="translate(-0.242)" fill="#101010" ></path> </svg>
    
    <input
        bind:value={value}
        on:input={e => update(e.target.value)}
        placeholder={placeholder}
        spellcheck="false"
        maxlength={maxlength}
    />
</div>
