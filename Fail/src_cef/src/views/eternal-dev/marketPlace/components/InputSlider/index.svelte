<script>
    import { formatThousands } from "../../modules/money";
    import RangeSlider from 'svelte-range-slider-pips';

    export let value;
    export let update;
    export let prefix;

    export let min;
    export let max;

    export let minLabel;
    export let maxLabel;

    export let rightText = null;

    let values = [value],
        inputValue = `${values[0]} ${prefix}`;
        
    $: inputValue = `${formatThousands(Number(values[0]))} ${prefix}`;
    $: if (values[0] != value) {
        update(values[0])
    }
    
    function handleInput(event) {
        event.preventDefault();
        let val = event.target.value;
        
        if (event.key == "Backspace")
            val = values[0].toString().slice(0, -1);
        else if (!isNaN(event.key))
            val = values[0].toString() + event.key;
        else if (event.key == "ArrowLeft")
            val = values[0] - 1;
        else if (event.key == "ArrowRight")
            val = values[0] + 1;

        let formattedValue = val.toString().replace(/\D/g, '');
        if (Number(formattedValue) < min || formattedValue == '')
            formattedValue = `${min}`;

        values[0] = Number(formattedValue);
        update(values[0]);
    }
</script>

<div class="market-create__slider">
    <div class="slider__label">
        <span>{ minLabel }</span>
        <span class="slider__label-right">{ maxLabel }</span>
    </div>
    <div class="slider__content">
        <div class="market-input">
            <input on:keydown={handleInput} bind:value={inputValue} />
            <div class="market-input__additional-info">{ rightText || `${max} ${prefix}` }</div>
            <div class="market-input__slider">
                <RangeSlider range="min" min={min} max="{max}" bind:values={values} />
            </div>
            <div class="slider-background"></div>
        </div>
    </div>
</div>