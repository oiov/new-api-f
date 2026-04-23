package seedance

import "github.com/QuantumNous/new-api/relay/channel/openai"

type Adaptor struct {
	openai.Adaptor
}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return ChannelName
}
